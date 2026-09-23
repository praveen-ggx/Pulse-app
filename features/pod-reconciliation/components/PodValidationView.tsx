import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LoadingIndicator } from "@/components/LoadingIndicator";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  
  Alert,
  Image,
  Linking,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Theme from '@/constants/Theme';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueAndProcessOcrJob, getOcrJobForPodAttachment } from '@/features/ocr';
import { chatWithDocument } from '@/lib/pod/chat';
import { compressImage } from '@/lib/pod/imageCompression';
import { TripCompletionOrPodTags } from "@/features/trips/components/TripPodStatusTags";
import { tripIsDeliveredStatus } from "@/features/trips/services/tripDocumentLrPod.service";
import type { PodReconciliationTripView } from '../services/podReconciliationService';
import type { PODExtraction, ConfidenceField} from '@/types/pod';
import { getDocumentViewUrl } from '@/features/trips/services/tripDocuments.service';

interface PodValidationViewProps {
  trip: PodReconciliationTripView | null;
  onClose: () => void;
  isTablet?: boolean;
}

function createEmptyExtraction(): PODExtraction {
  return {
    header: {},
    financials: {},
    transport: {},
    parties: {},
    inspection: {},
    line_items: [],
  } as unknown as PODExtraction;
}

export function PodValidationView({ trip, onClose, isTablet }: PodValidationViewProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [shortage, setShortage] = useState('0');
  const [damage, setDamage] = useState('0');
  const [penalty, setPenalty] = useState('0');
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [extractedData, setExtractedData] = useState<PODExtraction | null>(createEmptyExtraction());

  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'audit' | 'chat'>('audit');
  const [selectedDocIndex, setSelectedDocIndex] = useState(0);
  const [isChatSidebarOpen, setIsChatSidebarOpen] = useState(false);
  const [docLoading, setDocLoading] = useState(false);
  const [docLoadError, setDocLoadError] = useState<string | null>(null);
  const [renderableDocUrl, setRenderableDocUrl] = useState<string | null>(null);

  // Catalyst-style full-screen terminal should always be used on web.
  const isDesktopTerminal = Platform.OS === 'web' || !!isTablet;

  const { data: attachments = [], isLoading: isLoadingAttachments } = useQuery({
    queryKey: ['pod-attachments', trip?.internal_id],
    queryFn: async () => {
      if (!trip?.internal_id) return [];
      const { data, error } = await supabase()
        .from('trip_documents')
        .select('id, trip_id, storage_path, file_name, mime_type, size_bytes')
        .eq('trip_id', trip.internal_id)
        .eq('document_type', 'pod');
      
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        trip_id: row.trip_id,
        file_path: row.storage_path,
        file_name: row.file_name,
        file_type: row.mime_type,
        file_size: row.size_bytes,
        extracted_data: null,
      }));
    },
    enabled: !!trip?.internal_id
  });

  const STORAGE_BUCKET = 'trip-documents' as const;

  function sanitizeStoragePath(p: string): string {
    let out = (p || '').trim();
    out = out.replace(/^\/+/, '');
    if (out.startsWith(`${STORAGE_BUCKET}/`)) out = out.slice(STORAGE_BUCKET.length + 1);
    return out;
  }

  const getFileUrl = (path: string) => {
    return supabase().storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
  };

  const updateExtractedField = (
    section: keyof Omit<PODExtraction, 'line_items' | 'validationError'>,
    key: string,
    value: string | number,
  ) => {
    setExtractedData(prev => {
      const current = prev || createEmptyExtraction();
      const sectionObj = (current[section] ?? {}) as Record<string, ConfidenceField | undefined>;
      const existing = sectionObj[key];
      return {
        ...current,
        [section]: {
          ...sectionObj,
          [key]: {
            confidence: existing?.confidence ?? 1,
            value,
          },
        },
      };
    });
  };

  const handleScanWithAI = async () => {
    if (attachments.length === 0 || !trip?.internal_id) return;
    const doc = attachments[selectedDocIndex] || attachments[0];
    if (!doc) return;

    try {
      setIsScanning(true);
      setScanProgress(5);

      const { data: tripMeta, error: tripMetaError } = await supabase()
        .from('trips')
        .select('organization_id')
        .eq('id', trip.internal_id)
        .maybeSingle();
      if (tripMetaError) throw tripMetaError;
      if (!tripMeta?.organization_id) throw new Error('Trip organization not found');

      const url = await getDocumentViewUrl(sanitizeStoragePath(doc.file_path));
      const response = await fetch(url);
      const blob = await response.blob();

      setScanProgress(15);
      const finalFile = await compressImage(blob, 1200);

      setScanProgress(30);
      const objectUrl = URL.createObjectURL(finalFile);
      try {
        const job = await enqueueAndProcessOcrJob({
          organizationId: tripMeta.organization_id,
          localUri: objectUrl,
          sourceKind: 'pod_document',
          tripId: trip.internal_id,
          podAttachmentId: doc.id,
          storagePath: doc.file_path,
        });
        const extraction = job.result_json?.extraction as PODExtraction | undefined;
        if (!extraction) throw new Error('OCR completed without extraction payload');
        setExtractedData(extraction);

        if (extraction.financials) {
          if (extraction.financials.shortage_amount?.value) {
            setShortage(String(extraction.financials.shortage_amount.value));
          }
          if (extraction.financials.damage_amount?.value) {
            setDamage(String(extraction.financials.damage_amount.value));
          }
        }
        const durationSec = (job.processing_duration_ms ?? 0) / 1000;
        Alert.alert('AI Scan Complete', `Extracted data in ${durationSec.toFixed(1)}s`);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Scan Failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsScanning(false);
      setScanProgress(0);
    }
  };

  useEffect(() => {
    const doc = attachments[selectedDocIndex] || attachments[0];
    if (!doc) return;

    const persisted = doc.extracted_data as PODExtraction | null | undefined;
    if (persisted && typeof persisted === 'object') {
      setExtractedData(persisted);
      return;
    }

    let cancelled = false;
    void getOcrJobForPodAttachment(doc.id).then((job) => {
      if (cancelled || !job?.result_json?.extraction) return;
      setExtractedData(job.result_json.extraction as PODExtraction);
    });

    return () => {
      cancelled = true;
    };
  }, [attachments, selectedDocIndex]);

  const handleChatSubmit = async () => {
    if (!chatInput.trim() || attachments.length === 0) return;
    
    const userMessage = chatInput.trim();
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const doc = attachments[selectedDocIndex] || attachments[0];
      const url = await getDocumentViewUrl(sanitizeStoragePath(doc.file_path));
      const response = await fetch(url);
      const blob = await response.blob();
      const finalFile = await compressImage(blob, 1200);

      const reply = await chatWithDocument(await finalFile.arrayBuffer(), doc.file_type || 'image/jpeg', chatMessages, userMessage);
      setChatMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      console.error(err);
      setChatMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I couldn't process that request." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleReject = () => {
    Alert.alert('Dispute Raised', `POD for Trip ${trip?.id} has been marked for dispute.`);
    onClose();
  };

  const handleValidate = async () => {
    if (!trip) return;
    try {
      setIsSubmitting(true);
      
      const s = parseFloat(shortage) || 0;
      const d = parseFloat(damage) || 0;
      const p = parseFloat(penalty) || 0;
      const totalDeductions = s + d + p;

      if (totalDeductions > (trip.amount || 0)) {
        Alert.alert('Validation Error', 'Total deductions cannot exceed the trip amount.');
        setIsSubmitting(false);
        return;
      }

      const finalAmount = (trip.amount || 0) - totalDeductions;

      const { error: tripError } = await supabase()
        .from("trips")
        .update({
          pod_received_at: trip.pod_received_date
            ? new Date(`${trip.pod_received_date}T00:00:00.000Z`).toISOString()
            : new Date().toISOString(),
          client_price: finalAmount,
        })
        .eq("id", trip.internal_id);

      if (tripError) throw tripError;
      
      // Store audit details in activity_logs via log_activity RPC since schema changes are prohibited in pulse
      await supabase().rpc('log_activity', {
        p_action: 'POD_VALIDATED',
        p_entity_type: 'trip',
        p_entity_id: trip.internal_id,
        p_details: { 
          audit_shortage: s,
          audit_damage: d,
          audit_penalty: p,
          audit_remarks: remarks,
          original_amount: trip.amount || 0,
          final_amount: finalAmount
        },
      });

      Alert.alert('Success', 'POD validated successfully.');
      queryClient.invalidateQueries({ queryKey: ['q', 'trips', 'reconciliation'] });
      queryClient.invalidateQueries({ queryKey: ['q', 'invoicing', 'summary'] });
      onClose();
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to validate POD');
    } finally {
      setIsSubmitting(false);
    }
  };

  // NOTE: no early return above this point. Everything below runs hooks
  // (useMemo/useRef/useEffect), and a `if (!trip) return null` here changed the
  // hook count between renders whenever `trip` flipped null -> set, which React
  // reports as minified error #310. The bail-out now happens after every hook
  // has been called; see the `if (!trip) return null` further down.
  const originalAmount = trip?.amount ?? 0;
  const s = parseFloat(shortage) || 0;
  const d = parseFloat(damage) || 0;
  const p = parseFloat(penalty) || 0;
  const totalDeductions = s + d + p;
  const finalAmount = originalAmount - totalDeductions;
  const receivedLRs = Array.isArray(trip?.trip_pods) ? trip.trip_pods : [];
  const allLRs = Array.isArray(trip?.lr_numbers) ? trip.lr_numbers : [];
  const tripExtras = (trip ?? {}) as Partial<PodReconciliationTripView> & {
    vehicle_no?: string | null;
    vehicle_display_number?: string | null;
    vehicle_type?: string | null;
    truck_type?: string | null;
  };
  const assignedVehicle =
    tripExtras.vehicle_no ||
    tripExtras.vehicle_display_number ||
    'N/A';
  const assignedVehicleType = tripExtras.vehicle_type || tripExtras.truck_type || undefined;
  const dispatchDate = trip?.date
    ? new Date(trip.date).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';
  
  const currentDoc = attachments[selectedDocIndex] || attachments[0];
  const currentDocKey = `${currentDoc?.id ?? ''}:${currentDoc?.file_path ?? ''}`;
  const storagePath = useMemo(
    () => (currentDoc?.file_path ? sanitizeStoragePath(currentDoc.file_path) : null),
    [currentDocKey],
  );
  const currentDocUrl = useMemo(
    () =>
      storagePath != null
        ? getFileUrl(storagePath)
        : null,
    [storagePath],
  );
  const previewDocUrl = renderableDocUrl || currentDocUrl;
  const previewDocImageSource = useMemo(
    () => (previewDocUrl ? { uri: previewDocUrl } : null),
    [previewDocUrl],
  );
  const mobileDocImageSource = useMemo(
    () => (currentDocUrl ? { uri: currentDocUrl } : null),
    [currentDocUrl],
  );
  const currentDocType = (currentDoc?.file_type || '').toLowerCase();
  const isPdf = currentDocType.includes('pdf') || previewDocUrl?.toLowerCase().includes('.pdf');
  const isImage = currentDocType.startsWith('image/');
  const attachmentPreviewItems = useMemo(
    () =>
      attachments.map((att) => {
        const docUrl = getFileUrl(sanitizeStoragePath(att.file_path));
        return {
          ...att,
          docUrl,
          imageSource: att.file_type?.startsWith('image/') ? { uri: docUrl } : null,
        };
      }),
    [attachments],
  );

  const lastSignedUrlKeyRef = useRef<string>('');
  const previewLoadUrlRef = useRef<string | null>(null);
  const previewLoadStartedRef = useRef(false);
  const previewLoadEndedRef = useRef(false);

  useEffect(() => {
    // Prevent update loops if parent re-renders with same doc info.
    if (lastSignedUrlKeyRef.current === currentDocKey) return;
    lastSignedUrlKeyRef.current = currentDocKey;

    let cancelled = false;
    setDocLoadError(null);
    setDocLoading(true);

    async function run() {
      if (!storagePath) return;

      // Prefer signed URL: works for both public & private buckets.
      // If bucket is missing/misnamed, we'll surface a clear error.
      try {
        const signedUrl = await getDocumentViewUrl(storagePath);
        if (cancelled) return;
        if (!signedUrl) throw new Error('Object not found');
        setRenderableDocUrl((prev) => (prev === signedUrl ? prev : signedUrl));
      } catch (e: unknown) {
        if (cancelled) return;
        setDocLoadError(
          (e instanceof Error ? e.message : null) ||
            'Storage preview failed. Check bucket name and file path.',
        );
      } finally {
        if (!cancelled) {
          setDocLoading(false);
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [currentDocKey, storagePath]);

  useEffect(() => {
    // On web, image decode/load events can fire more than once; guard state flips per URL.
    previewLoadUrlRef.current = previewDocUrl ?? null;
    previewLoadStartedRef.current = false;
    previewLoadEndedRef.current = false;
  }, [previewDocUrl]);

  // Safe to bail out here: every hook above has already run, so the hook count
  // is identical whether or not `trip` is set (React error #310 / GX-PULSE-T).
  if (!trip) return null;

  const tripPodTags = (
    <TripCompletionOrPodTags
      compact
      tripCompleted={tripIsDeliveredStatus(trip.trip_status)}
      softCopyReceived={trip.soft_pod_received}
      hardCopyReceived={trip.hard_pod_received}
    />
  );

  const renderAuditForm = () => (
    <>
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <FontAwesome name="bolt" size={14} color={Theme.textPrimaryDark} style={{ marginRight: 8 }} />
          <Text style={styles.sectionLabel}>Intelligence Brief</Text>
        </View>
        <View style={styles.intelligenceCard}>
          <View style={styles.infoTwoCol}>
            <InfoItem label="Client" value={trip.client_name || '—'} />
            <InfoItem label="Dispatch Date" value={dispatchDate} />
          </View>
          <InfoItem
            label={trip.lane === "asset" ? "Driver" : "Vendor / Supplier"}
            value={
              trip.lane === "asset"
                ? trip.driver_name || trip.vendor_name || "N/A"
                : trip.vendor_name || "N/A"
            }
          />
          <InfoItem
            label="Route Vector"
            value={`${trip.pp_location || 'Unknown'} → ${trip.drop_point || 'Unknown'}`}
          />
          <View style={styles.infoTwoCol}>
            <InfoItem label="Assigned Vehicle" value={assignedVehicle} subValue={assignedVehicleType} />
            <InfoItem label="LR Coverage" value={`${receivedLRs.length} / ${allLRs.length}`} />
          </View>
          <View style={styles.lrBlock}>
            <Text style={styles.lrBlockLabel}>Linked Assets (LRs)</Text>
            <View style={styles.lrChipsWrap}>
              {receivedLRs.length > 0 ? (
                receivedLRs.map((lr) => (
                  <View key={lr} style={styles.lrChip}>
                    <Text style={styles.lrChipText}>{lr}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>No LRs identified</Text>
              )}
            </View>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.subsectionHeaderRow}>
          <Text style={styles.currencyIconText}>₹</Text>
          <Text style={styles.subsectionLabel}>Audit Adjustments</Text>
        </View>
        <View style={styles.inputCard}>
          <AuditInput label="Shortage Amount" value={shortage} onChange={setShortage} />
          <AuditInput label="Damage Amount" value={damage} onChange={setDamage} />
          <AuditInput label="Late Penalty" value={penalty} onChange={setPenalty} />
          <View style={styles.remarksBox}>
            <Text style={styles.inputLabel}>Auditor Remarks</Text>
            <TextInput
              style={styles.textArea}
              value={remarks}
              onChangeText={setRemarks}
              placeholder="Add notes about deductions or exceptions..."
              multiline
              numberOfLines={3}
            />
          </View>
        </View>
      </View>

      <ExtractionSection title="Header Information">
        <AIFieldRow label="LR Number" field={extractedData?.header?.lr_number} onChange={(v) => updateExtractedField('header', 'lr_number', v)} />
        <AIFieldRow label="Date" field={extractedData?.header?.date} onChange={(v) => updateExtractedField('header', 'date', v)} />
        <AIFieldRow label="Invoice Number" field={extractedData?.header?.invoice_number} onChange={(v) => updateExtractedField('header', 'invoice_number', v)} />
        <AIFieldRow label="Loading In Time" field={extractedData?.header?.arrival_date_time} onChange={(v) => updateExtractedField('header', 'arrival_date_time', v)} />
        <AIFieldRow label="Loading Out Time" field={extractedData?.header?.release_date_time} onChange={(v) => updateExtractedField('header', 'release_date_time', v)} />
        <AIFieldRow label="Unloading In Time" field={extractedData?.header?.unload_start_date_time} onChange={(v) => updateExtractedField('header', 'unload_start_date_time', v)} />
        <AIFieldRow label="Unloading Out Time" field={extractedData?.header?.unload_end_date_time} onChange={(v) => updateExtractedField('header', 'unload_end_date_time', v)} />
        <AIFieldRow label="Original GIR No." field={extractedData?.header?.original_gir_no} onChange={(v) => updateExtractedField('header', 'original_gir_no', v)} />
        <AIFieldRow label="GIR Number" field={extractedData?.header?.gir_number} onChange={(v) => updateExtractedField('header', 'gir_number', v)} />
        <AIFieldRow label="eWay Bill" field={extractedData?.header?.eway_bill_number} onChange={(v) => updateExtractedField('header', 'eway_bill_number', v)} />
      </ExtractionSection>

      <ExtractionSection title="Financials">
        <AIFieldRow label="Total Amount" field={extractedData?.financials?.total_amount} isNumber onChange={(v) => updateExtractedField('financials', 'total_amount', v)} />
        <AIFieldRow label="Loading Cost" field={extractedData?.financials?.loading_cost} isNumber onChange={(v) => updateExtractedField('financials', 'loading_cost', v)} />
        <AIFieldRow label="Unloading Cost" field={extractedData?.financials?.unloading_cost} isNumber onChange={(v) => updateExtractedField('financials', 'unloading_cost', v)} />
        <AIFieldRow label="Damage Cost" field={extractedData?.financials?.damage_cost} isNumber onChange={(v) => updateExtractedField('financials', 'damage_cost', v)} />
        <AIFieldRow label="Shortage Cost" field={extractedData?.financials?.shortage_cost} isNumber onChange={(v) => updateExtractedField('financials', 'shortage_cost', v)} />
        <AIFieldRow label="Loading Charges" field={extractedData?.financials?.loading_charges} isNumber onChange={(v) => updateExtractedField('financials', 'loading_charges', v)} />
        <AIFieldRow label="Unloading Charges" field={extractedData?.financials?.unloading_charges} isNumber onChange={(v) => updateExtractedField('financials', 'unloading_charges', v)} />
        <AIFieldRow label="Shortage Amount" field={extractedData?.financials?.shortage_amount} isNumber onChange={(v) => updateExtractedField('financials', 'shortage_amount', v)} />
        <AIFieldRow label="Damage Amount" field={extractedData?.financials?.damage_amount} isNumber onChange={(v) => updateExtractedField('financials', 'damage_amount', v)} />
        <AIFieldRow label="Leakage Amount" field={extractedData?.financials?.leakage_amount} isNumber onChange={(v) => updateExtractedField('financials', 'leakage_amount', v)} />
        <AIFieldRow label="Debit Reason Code" field={extractedData?.financials?.debit_reason_code} onChange={(v) => updateExtractedField('financials', 'debit_reason_code', v)} />
        <AIFieldRow label="Debit Type" field={extractedData?.financials?.debit_type} onChange={(v) => updateExtractedField('financials', 'debit_type', v)} />
      </ExtractionSection>

      <ExtractionSection title="Parties">
        <AIFieldRow label="From" field={extractedData?.parties?.consignor_name_address} onChange={(v) => updateExtractedField('parties', 'consignor_name_address', v)} />
        <AIFieldRow label="To" field={extractedData?.parties?.consignee_name_address} onChange={(v) => updateExtractedField('parties', 'consignee_name_address', v)} />
        <AIFieldRow label="GSTIN" field={extractedData?.parties?.gstin} onChange={(v) => updateExtractedField('parties', 'gstin', v)} />
        <AIFieldRow label="PAN" field={extractedData?.parties?.pan} onChange={(v) => updateExtractedField('parties', 'pan', v)} />
        <AIFieldRow label="GST Paid By" field={extractedData?.parties?.gst_paid_by} onChange={(v) => updateExtractedField('parties', 'gst_paid_by', v)} />
      </ExtractionSection>

      <ExtractionSection title="Inspection">
        <AIFieldRow label="Goods Report" field={extractedData?.inspection?.goods_inspection_report} onChange={(v) => updateExtractedField('inspection', 'goods_inspection_report', v)} />
        <AIFieldRow label="BPIL Copy Data" field={extractedData?.inspection?.bpil_copy_data} onChange={(v) => updateExtractedField('inspection', 'bpil_copy_data', v)} />
        <AIFieldRow label="LSCR Copy Data" field={extractedData?.inspection?.lscr_copy_data} onChange={(v) => updateExtractedField('inspection', 'lscr_copy_data', v)} />
        <AIFieldRow label="Tolerance Hours" field={extractedData?.inspection?.tolerance_hours} isNumber onChange={(v) => updateExtractedField('inspection', 'tolerance_hours', v)} />
        <AIFieldRow label="Actual vs Standard Time" field={extractedData?.inspection?.actual_vs_standard_time} onChange={(v) => updateExtractedField('inspection', 'actual_vs_standard_time', v)} />
        <AIFieldRow label="Short Cases" field={extractedData?.inspection?.short_cases !== undefined ? { value: extractedData.inspection.short_cases, confidence: 1 } : undefined} isNumber onChange={(v) => updateExtractedField('inspection', 'short_cases', v)} />
        <AIFieldRow label="Damaged Cases" field={extractedData?.inspection?.damaged_cases !== undefined ? { value: extractedData.inspection.damaged_cases, confidence: 1 } : undefined} isNumber onChange={(v) => updateExtractedField('inspection', 'damaged_cases', v)} />
        <AIFieldRow label="Excess Cases" field={extractedData?.inspection?.excess_cases !== undefined ? { value: extractedData.inspection.excess_cases, confidence: 1 } : undefined} isNumber onChange={(v) => updateExtractedField('inspection', 'excess_cases', v)} />
      </ExtractionSection>

      <ExtractionSection title="Transport Details">
        <AIFieldRow label="Transporter Name" field={extractedData?.transport?.transporter_name} onChange={(v) => updateExtractedField('transport', 'transporter_name', v)} />
        <AIFieldRow label="Vehicle Number" field={extractedData?.transport?.vehicle_number} onChange={(v) => updateExtractedField('transport', 'vehicle_number', v)} />
        <AIFieldRow label="Driver Name" field={extractedData?.transport?.driver_name} onChange={(v) => updateExtractedField('transport', 'driver_name', v)} />
        <AIFieldRow label="Driver Phone" field={extractedData?.transport?.driver_phone} onChange={(v) => updateExtractedField('transport', 'driver_phone', v)} />
      </ExtractionSection>
    </>
  );

  const renderChatForm = () => (
    <View style={styles.chatSection}>
      <ScrollView style={styles.chatHistory}>
        {chatMessages.length === 0 && (
          <Text style={styles.emptyText}>Ask questions about the attached PODs (e.g. "Why is there a delay penalty?").</Text>
        )}
        {chatMessages.map((m, i) => (
          <View key={i} style={[styles.chatBubble, m.role === 'user' ? styles.chatBubbleUser : styles.chatBubbleAssistant]}>
            <Text style={m.role === 'user' ? styles.chatText : styles.chatTextAssistant}>{m.content}</Text>
          </View>
        ))}
        {isChatLoading && (
          <View style={[styles.chatBubble, styles.chatBubbleAssistant]}>
            <LoadingIndicator size="small" color={Theme.primary} />
          </View>
        )}
      </ScrollView>
      <View style={styles.chatInputWrapper}>
        <TextInput
          style={styles.chatInput}
          value={chatInput}
          onChangeText={setChatInput}
          placeholder="Ask POD AI..."
          placeholderTextColor={Theme.textMuted}
        />
        <Pressable style={styles.chatSendBtn} onPress={handleChatSubmit} disabled={isChatLoading || !chatInput.trim()}>
          <FontAwesome name="send" size={16} color="#fff" />
        </Pressable>
      </View>
    </View>
  );

  const renderChatSidebar = () => (
    <View style={styles.chatSidebar}>
      <View style={styles.chatSidebarHeader}>
        <View style={styles.chatSidebarHeaderLeft}>
          <View style={styles.chatBotIcon}>
            <FontAwesome name="android" size={16} color="#fff" />
          </View>
          <View>
            <Text style={styles.chatSidebarTitle}>POD AI</Text>
            <Text style={styles.chatSidebarSub}>DIGITAL AUDIT ASSISTANT</Text>
          </View>
        </View>
        <Pressable
          onPress={() => setIsChatSidebarOpen(false)}
          style={styles.chatSidebarCloseBtn}
          hitSlop={10}
        >
          <FontAwesome name="times" size={14} color={Theme.textMuted} />
        </Pressable>
      </View>

      <View style={styles.chatSidebarBody}>
        {renderChatForm()}
      </View>
    </View>
  );

  const renderFooterSummary = () => (
    <View style={styles.summaryContainer}>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Original Value</Text>
        <Text style={styles.summaryValue}>₹{originalAmount.toLocaleString()}</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabelRed}>Total Deductions</Text>
        <Text style={styles.summaryValueRed}>- ₹{totalDeductions.toLocaleString()}</Text>
      </View>
      <View style={[styles.summaryRow, styles.summaryRowTotal]}>
        <Text style={styles.summaryLabelBold}>Cleared For Invoicing</Text>
        <Text style={styles.summaryValueBold}>₹{finalAmount.toLocaleString()}</Text>
      </View>
    </View>
  );

  const renderAttachmentsGrid = () => (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Attachments ({attachments.length})</Text>
      {isLoadingAttachments ? (
        <LoadingIndicator size="small" color={Theme.primary} />
      ) : attachments.length === 0 ? (
        <Text style={styles.emptyText}>No documents attached.</Text>
      ) : (
        <View style={styles.attachmentGrid}>
          {attachmentPreviewItems.map((att, idx) => {
            const isSelected = selectedDocIndex === idx;
            return (
              <View key={att.id} style={[styles.attachmentItem, isSelected && { borderColor: Theme.primary }]}>
                <Pressable onPress={() => { setSelectedDocIndex(idx); if (Platform.OS !== 'web') Linking.openURL(att.docUrl); }}>
                  {att.file_type && att.file_type.startsWith('image/') && att.imageSource ? (
                    <Image 
                      source={att.imageSource}
                      style={{ width: '100%', height: 100, borderRadius: 8 }} 
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={{ width: '100%', height: 100, alignItems: 'center', justifyContent: 'center' }}>
                      <FontAwesome name="file-pdf-o" size={40} color={Theme.primary} />
                    </View>
                  )}
                </Pressable>
                <Text style={styles.attachmentName} numberOfLines={1}>{att.file_name}</Text>
                
                {/* On mobile, scan button stays with the thumbnail */}
                {!isTablet && (
                  <Pressable 
                    style={styles.scanBtn} 
                    onPress={() => { setSelectedDocIndex(idx); handleScanWithAI(); }}
                    disabled={isScanning}
                  >
                    {isScanning ? (
                      <LoadingIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <FontAwesome name="magic" size={12} color="#fff" />
                        <Text style={styles.scanBtnText}>Scan</Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );

  const renderDocumentViewer = () => (
    <View style={styles.documentViewerContainer}>
      {isLoadingAttachments ? (
        <View style={styles.centered}>
          <LoadingIndicator size="large" color={Theme.primary} />
          <Text style={styles.loadingText}>Syncing Secure Assets...</Text>
        </View>
      ) : attachments.length === 0 ? (
        <View style={styles.centered}>
          <FontAwesome name="image" size={48} color={Theme.borderLight} />
          <Text style={styles.emptyStateText}>No valid proof of delivery documents attached to this trip.</Text>
        </View>
      ) : previewDocUrl ? (
        <>
          <View style={styles.docInfoOverlay}>
            <View style={styles.docInfoBox}>
              <View>
                <Text style={styles.docFileName} numberOfLines={1}>{currentDoc.file_name}</Text>
                <Text style={styles.docFileSize}>{(currentDoc.file_size / 1024 / 1024).toFixed(2)} MB</Text>
              </View>
              <View style={styles.docActionIcons}>
                <Pressable style={styles.docIconBtn} onPress={() => Linking.openURL(previewDocUrl)}>
                  <FontAwesome name="external-link" size={14} color={Theme.textMuted} />
                </Pressable>
                <Pressable style={styles.docIconBtn} onPress={() => Linking.openURL(`${previewDocUrl}?download=${currentDoc.file_name}`)}>
                  <FontAwesome name="download" size={14} color={Theme.textMuted} />
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.documentStage}>
            {docLoadError ? (
              <View style={styles.centered}>
                <FontAwesome name="exclamation-triangle" size={28} color="#ef4444" />
                <Text style={styles.emptyStateText}>
                  Couldn’t load preview. {docLoadError}
                </Text>
                <Pressable
                  style={[styles.btnPrimaryFilled, { marginTop: 12 }]}
                  onPress={() => Linking.openURL(previewDocUrl)}
                >
                  <Text style={styles.btnPrimaryFilledText}>OPEN DOCUMENT</Text>
                </Pressable>
              </View>
            ) : Platform.OS === 'web' && isPdf ? (
            // On web, render PDFs using an iframe (closest to Catalyst UX).
            // RN-web supports arbitrary DOM elements in JSX.
            <iframe
              src={previewDocUrl}
              title={currentDoc?.file_name || 'POD document'}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                borderRadius: 16,
                background: 'white',
              }}
              onLoad={() => {
                setDocLoading(false);
                setDocLoadError(null);
              }}
            />
          ) : isImage ? (
            <Image
              source={previewDocImageSource as { uri: string }}
              style={styles.documentImage}
              resizeMode="contain"
              onLoadStart={() => {
                if (Platform.OS === 'web') {
                  if (previewLoadStartedRef.current) return;
                  previewLoadStartedRef.current = true;
                }
                setDocLoadError(null);
                setDocLoading((prev) => (prev ? prev : true));
              }}
              onLoadEnd={() => {
                if (Platform.OS === 'web') {
                  if (previewLoadEndedRef.current) return;
                  previewLoadEndedRef.current = true;
                }
                setDocLoading(false);
              }}
              onError={(e) => {
                if (Platform.OS === 'web') {
                  if (previewLoadEndedRef.current) return;
                  previewLoadEndedRef.current = true;
                }
                setDocLoading(false);
                const err = e as { nativeEvent?: { error?: string }; message?: string };
                const msg =
                  err?.nativeEvent?.error ||
                  err?.message ||
                  'Image failed to load';
                setDocLoadError(String(msg));
              }}
            />
          ) : (
            <View style={styles.centered}>
              <FontAwesome name="file-pdf-o" size={56} color={Theme.primary} />
              <Text style={styles.emptyStateText}>
                Preview not available. Open the document using the external link.
              </Text>
              <Pressable
                style={[styles.btnPrimaryFilled, { marginTop: 12 }]}
                onPress={() => Linking.openURL(previewDocUrl)}
              >
                <Text style={styles.btnPrimaryFilledText}>OPEN DOCUMENT</Text>
              </Pressable>
            </View>
          )}

            {docLoading && (
              <View style={styles.docLoadingOverlay}>
                <LoadingIndicator size="large" color={Theme.primary} />
                <Text style={styles.loadingText}>Loading preview…</Text>
              </View>
            )}
          </View>
        </>
      ) : null}
    </View>
  );

  if (isDesktopTerminal) {
    return (
      <View style={styles.tabletWrapper}>
        <View style={styles.tabletHeaderStrip}>
          <View style={styles.tabletHeaderLeft}>
            <Pressable onPress={onClose} style={styles.tabletCloseBtn}>
              <FontAwesome name="times" size={16} color={Theme.textMuted} />
            </Pressable>
            <View style={styles.tabletHeaderDivider} />
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <Text style={styles.verificationModeText}>VERIFICATION MODE</Text>
                <Text style={styles.tabletHeaderTitle}>VALIDATE POD: {trip.id}</Text>
                {tripPodTags}
              </View>
              <Text style={styles.tabletHeaderSub}>DIGITAL AUDIT & LIQUIDITY CLEARANCE TERMINAL</Text>
            </View>
          </View>
          
          <View style={styles.tabletHeaderRight}>
            <Pressable
              style={[
                styles.btnOutline,
                isChatSidebarOpen && {
                  backgroundColor: Theme.textPrimaryDark,
                  borderColor: Theme.textPrimaryDark,
                },
              ]}
              onPress={() => setIsChatSidebarOpen(v => !v)}
            >
              <FontAwesome
                name="comment-o"
                size={12}
                color={isChatSidebarOpen ? '#fff' : Theme.textPrimaryDark}
              />
              <Text
                style={[
                  styles.btnOutlineText,
                  isChatSidebarOpen && { color: '#fff' },
                ]}
              >
                ASK POD AI
              </Text>
            </Pressable>
            <Pressable style={styles.btnPrimaryLight} onPress={handleScanWithAI} disabled={isScanning || isSubmitting}>
              {isScanning ? <LoadingIndicator size="small" color={Theme.primary} /> : <FontAwesome name="magic" size={12} color={Theme.primary} />}
              <Text style={styles.btnPrimaryLightText}>{isScanning ? `SCANNING ${scanProgress}%` : 'SCAN WITH AI'}</Text>
            </Pressable>
            <Pressable style={styles.btnDangerOutline} onPress={handleReject} disabled={isSubmitting}>
              <Text style={styles.btnDangerOutlineText}>RAISE DISPUTE</Text>
            </Pressable>
            <Pressable style={styles.btnPrimaryFilled} onPress={handleValidate} disabled={isSubmitting}>
              {isSubmitting ? <LoadingIndicator size="small" color="#fff" /> : <FontAwesome name="shield" size={12} color="#fff" />}
              <Text style={styles.btnPrimaryFilledText}>APPROVE INVOICING</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.tabletMainLayout}>
          <View style={styles.tabletLeftCol}>
            <ScrollView style={styles.tabletLeftScroll} showsVerticalScrollIndicator={false}>
              {renderAuditForm()}
              {renderAttachmentsGrid()}
            </ScrollView>
            <View style={styles.tabletFooterWrapper}>
              {renderFooterSummary()}
            </View>
          </View>

          <View style={styles.tabletRightCol}>
            {attachments.length > 1 && (
               <View style={styles.docDotsOverlay}>
                 {attachments.map((_, idx) => (
                    <Pressable 
                      key={idx} 
                      onPress={() => setSelectedDocIndex(idx)}
                      style={[styles.docDot, selectedDocIndex === idx ? styles.docDotActive : styles.docDotInactive]} 
                    />
                 ))}
               </View>
            )}
            {attachments.length > 1 && (
              <>
                <Pressable
                  style={[styles.docNavBtn, styles.docNavBtnLeft]}
                  onPress={() =>
                    setSelectedDocIndex((prev) =>
                      (prev - 1 + attachments.length) % attachments.length,
                    )
                  }
                >
                  <FontAwesome name="chevron-left" size={22} color={Theme.textMuted} />
                </Pressable>
                <Pressable
                  style={[styles.docNavBtn, styles.docNavBtnRight]}
                  onPress={() =>
                    setSelectedDocIndex((prev) => (prev + 1) % attachments.length)
                  }
                >
                  <FontAwesome name="chevron-right" size={22} color={Theme.textMuted} />
                </Pressable>
              </>
            )}
            {renderDocumentViewer()}
            {isChatSidebarOpen && renderChatSidebar()}
          </View>
        </View>
      </View>
    );
  }

  // MOBILE VIEW
  return (
    <Modal visible animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
              <Text style={styles.headerTitle}>VALIDATE POD: {trip.id}</Text>
              {tripPodTags}
              <Text style={styles.headerSub}>DIGITAL AUDIT & LIQUIDITY CLEARANCE TERMINAL</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <FontAwesome name="times" size={20} color={Theme.textMuted} />
            </Pressable>
          </View>
          
          <View style={styles.tabContainer}>
            <Pressable style={[styles.tab, activeTab === 'audit' && styles.tabActive]} onPress={() => setActiveTab('audit')}>
              <Text style={[styles.tabText, activeTab === 'audit' && styles.tabTextActive]}>Audit</Text>
            </Pressable>
            <Pressable style={[styles.tab, activeTab === 'chat' && styles.tabActive]} onPress={() => setActiveTab('chat')}>
              <Text style={[styles.tabText, activeTab === 'chat' && styles.tabTextActive]}>AI Chat</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {activeTab === 'audit' ? renderAuditForm() : renderChatForm()}
            {renderAttachmentsGrid()}
            {Platform.OS !== 'web' && mobileDocImageSource && (
              <View style={styles.mobileDocViewer}>
                 <Image source={mobileDocImageSource} style={{width: '100%', height: 300, borderRadius: 12}} resizeMode="cover" />
              </View>
            )}
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: Math.max(20, insets.bottom + 8) }]}>
            {renderFooterSummary()}
            <View style={styles.actionButtonsRow}>
              <Pressable 
                style={[styles.disputeBtn, isSubmitting && styles.submitBtnDisabled]} 
                onPress={handleReject}
                disabled={isSubmitting}
              >
                <Text style={styles.disputeBtnText}>Raise Dispute</Text>
              </Pressable>
              <Pressable 
                style={[styles.submitBtn, {flex: 2}, isSubmitting && styles.submitBtnDisabled]} 
                onPress={handleValidate}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <LoadingIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>Approve Invoicing</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ExtractionSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.extractionSection}>
      <Text style={styles.extractionSectionTitle}>{title}</Text>
      <View style={styles.extractionSectionContent}>
        {children}
      </View>
    </View>
  );
}

function AIFieldRow({ label, field, isNumber, onChange }: { label: string; field: ConfidenceField | ConfidenceField<number> | null | undefined; isNumber?: boolean; onChange: (val: string | number) => void }) {
  const value = field?.value !== undefined ? field.value : '';
  const confidence = field?.confidence ?? null;
  const isLowConfidence = confidence != null && confidence < 0.85;

  return (
    <View style={styles.aiFieldRow}>
      <Text style={styles.aiFieldLabel}>{label}</Text>
      <View style={styles.aiFieldInputWrapper}>
        <TextInput
          style={[styles.aiFieldInput, isLowConfidence && styles.aiFieldInputWarning]}
          value={String(value)}
          onChangeText={(txt) => onChange(isNumber ? (txt === '' ? '' : Number(txt)) : txt)}
          keyboardType={isNumber ? 'numeric' : 'default'}
          placeholder="—"
          placeholderTextColor={Theme.textMuted}
        />
        {isLowConfidence && confidence != null && (
          <View style={styles.confidenceBadge}>
            <Text style={styles.confidenceText}>{Math.round(confidence * 100)}%</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function AuditInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.auditInputContainer}>
      <View style={styles.auditInputIconContainer}>
        <FontAwesome name="exclamation-triangle" size={14} color={Theme.textPrimaryDark} />
      </View>
      <View style={styles.auditInputContent}>
        <Text style={styles.auditInputLabel}>{label}</Text>
        <View style={styles.inputWrapper}>
          <Text style={styles.currencyPrefix}>₹</Text>
          <TextInput
            style={styles.auditTextInput}
            value={value}
            onChangeText={onChange}
            keyboardType="numeric"
            placeholder="0.00"
            placeholderTextColor={Theme.textMuted}
          />
        </View>
      </View>
    </View>
  );
}

function InfoItem({
  label,
  value,
  subValue,
}: {
  label: string;
  value: string;
  subValue?: string;
}) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoItemLabel}>{label}</Text>
      <Text style={styles.infoItemValue}>
        {value}
        {subValue ? <Text style={styles.infoItemSubValue}>{"\n"}{subValue}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Modal Base
  overlay: { flex: 1, backgroundColor: Theme.overlayBackdrop, justifyContent: 'flex-end' },
  sheet: { 
    backgroundColor: Theme.screenBackground, 
    borderTopLeftRadius: 20, 
    borderTopRightRadius: 20, 
    height: '90%',
  },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 20, 
    borderBottomWidth: StyleSheet.hairlineWidth, 
    borderBottomColor: Theme.borderLight 
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: Theme.textPrimaryDark, textTransform: 'uppercase' },
  headerSub: { fontSize: 10, color: Theme.textMuted, fontWeight: '700', marginTop: 4, letterSpacing: 1 },
  content: { flex: 1, padding: 20 },

  // Sections
  section: { marginBottom: 24 },
  sectionLabel: { fontSize: 12, fontWeight: '800', color: Theme.textPrimaryDark, textTransform: 'uppercase', letterSpacing: 2 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, paddingHorizontal: 4 },
  subsectionHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, paddingHorizontal: 4 },
  currencyIconText: { fontSize: 14, fontWeight: '800', color: Theme.textPrimaryDark, marginRight: 12 },
  subsectionLabel: { fontSize: 11, fontWeight: '800', color: Theme.textPrimaryDark, textTransform: 'uppercase', letterSpacing: 2 },

  // Intelligence brief
  intelligenceCard: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 18,
    padding: 16,
    gap: 14,
  },
  infoTwoCol: { flexDirection: 'row', gap: 12 },
  infoItem: { flex: 1, minWidth: 0 },
  infoItemLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: Theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  infoItemValue: {
    fontSize: 13,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    lineHeight: 18,
  },
  infoItemSubValue: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textMuted,
  },
  lrBlock: {
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    paddingTop: 10,
  },
  lrBlockLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: Theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  lrChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  lrChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  lrChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  
  // Audit Inputs
  inputCard: { backgroundColor: Theme.cardWhite, padding: 0, gap: 12 },
  auditInputContainer: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: Theme.borderLight, backgroundColor: Theme.screenBackground },
  auditInputIconContainer: { width: 32, height: 32, borderRadius: 8, backgroundColor: Theme.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.surfaceBorder },
  auditInputContent: { flex: 1 },
  auditInputLabel: { fontSize: 10, fontWeight: '800', color: Theme.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center' },
  currencyPrefix: { fontSize: 14, color: Theme.textPrimaryDark, opacity: 0.5, marginRight: 4, fontWeight: '700' },
  auditTextInput: { flex: 1, fontSize: 16, fontWeight: '800', color: Theme.textPrimaryDark },
  remarksBox: { marginTop: 12 },
  inputLabel: { fontSize: 10, fontWeight: '800', color: Theme.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingHorizontal: 4 },
  textArea: { backgroundColor: Theme.screenBackground, borderRadius: 16, padding: 16, fontSize: 13, color: Theme.textPrimaryDark, height: 96, textAlignVertical: 'top', borderWidth: 1, borderColor: Theme.borderLight },
  
  // AI Extractions
  extractionSection: { marginBottom: 24 },
  extractionSectionTitle: { fontSize: 12, fontWeight: '800', color: Theme.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  extractionSectionContent: { gap: 12 },
  aiFieldRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 40 },
  aiFieldLabel: { fontSize: 12, color: Theme.textMuted, fontWeight: '600', flex: 1 },
  aiFieldEmpty: { fontSize: 14, color: Theme.textMuted, flex: 1, textAlign: 'right', fontWeight: '500' },
  aiFieldInputWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  aiFieldInput: { backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.borderInput, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, fontSize: 16, fontWeight: '600', color: Theme.textPrimaryDark, minWidth: 100, textAlign: 'right' },
  aiFieldInputWarning: { borderColor: '#f59e0b', backgroundColor: '#fffbeb' },
  confidenceBadge: { backgroundColor: '#dcfce7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  confidenceText: { fontSize: 10, color: '#166534', fontWeight: '700' },

  // Attachments
  attachmentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  attachmentItem: { width: 140, backgroundColor: Theme.cardWhite, borderRadius: 12, padding: 12, alignItems: 'stretch', gap: 8, borderWidth: 1, borderColor: Theme.borderLight },
  attachmentName: { fontSize: 10, color: Theme.textPrimaryDark, fontWeight: '600', textAlign: 'center' },
  emptyText: { fontSize: 13, color: Theme.textMuted, fontStyle: 'italic' },
  scanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, width: '100%', marginTop: 8 },
  scanBtnText: { color: Theme.buttonPrimaryText, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },

  // Summary & Footer
  summaryContainer: { marginBottom: 16, gap: 8 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryRowTotal: { marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: Theme.borderLight },
  summaryLabel: { fontSize: 13, color: Theme.textMuted, fontWeight: '700', textTransform: 'uppercase' },
  summaryValue: { fontSize: 16, color: Theme.textPrimaryDark, fontWeight: '700' },
  summaryLabelRed: { fontSize: 13, color: '#ef4444', fontWeight: '700', textTransform: 'uppercase' },
  summaryValueRed: { fontSize: 16, color: '#ef4444', fontWeight: '700' },
  summaryLabelBold: { fontSize: 14, color: Theme.textPrimaryDark, fontWeight: '800', textTransform: 'uppercase' },
  summaryValueBold: { fontSize: 24, color: Theme.textPrimaryDark, fontWeight: '800' },

  footer: { padding: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Theme.borderLight, backgroundColor: Theme.cardWhite },
  actionButtonsRow: { flexDirection: 'row', gap: 12 },
  disputeBtn: { flex: 1, backgroundColor: Theme.screenBackground, borderWidth: 1, borderColor: '#ef4444', height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  disputeBtnText: { color: '#ef4444', fontSize: 14, fontWeight: '800', textTransform: 'uppercase' },
  submitBtn: { backgroundColor: Theme.buttonPrimary, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: Theme.buttonPrimaryText, fontSize: 16, fontWeight: '800' },
  
  // Tabs
  tabContainer: { flexDirection: 'row', gap: 12, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: Theme.borderLight, paddingHorizontal: 20 },
  tab: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: Theme.primary },
  tabText: { fontSize: 13, fontWeight: '700', color: Theme.textMuted, textTransform: 'uppercase' },
  tabTextActive: { color: Theme.primary },
  
  // Chat
  chatSection: { flex: 1, minHeight: 300, paddingBottom: 24 },
  chatHistory: { flex: 1, marginBottom: 16 },
  chatBubble: { padding: 12, borderRadius: 12, maxWidth: '85%', marginBottom: 12 },
  chatBubbleUser: { backgroundColor: Theme.buttonPrimary, alignSelf: 'flex-end', borderBottomRightRadius: 2 },
  chatBubbleAssistant: { backgroundColor: Theme.cardWhite, alignSelf: 'flex-start', borderBottomLeftRadius: 2, borderWidth: 1, borderColor: Theme.borderLight },
  chatText: { fontSize: 13, color: Theme.buttonPrimaryText, fontWeight: '500' },
  chatTextAssistant: { fontSize: 13, color: Theme.textPrimaryDark, fontWeight: '500' },
  chatInputWrapper: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  chatInput: { flex: 1, backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.borderInput, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16 },
  chatSendBtn: { backgroundColor: Theme.buttonPrimary, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },

  mobileDocViewer: { marginTop: 24, marginBottom: 24 },

  // Tablet Layout (Exact Match to Web)
  tabletWrapper: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: Theme.surface },
  tabletHeaderStrip: { height: 64, backgroundColor: Theme.cardWhite, borderBottomWidth: 1, borderBottomColor: Theme.borderLight, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 32, zIndex: 20, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
  tabletHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  tabletCloseBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.surface },
  tabletHeaderDivider: { width: 1, height: 32, backgroundColor: Theme.borderLight },
  verificationModeText: { fontSize: 10, fontWeight: '800', color: Theme.primary, textTransform: 'uppercase', letterSpacing: 4 },
  tabletHeaderTitle: { fontSize: 18, fontWeight: '800', color: Theme.textPrimaryDark, textTransform: 'uppercase', letterSpacing: -0.5 },
  tabletHeaderSub: { fontSize: 9, fontWeight: '700', color: Theme.textMuted, textTransform: 'uppercase', letterSpacing: 2 },
  
  tabletHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  btnOutline: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: Theme.borderLight, backgroundColor: Theme.screenBackground },
  btnOutlineText: { fontSize: 10, fontWeight: '800', color: Theme.textPrimaryDark, letterSpacing: 1 },
  btnPrimaryLight: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: Theme.screenBackground },
  btnPrimaryLightText: { fontSize: 10, fontWeight: '800', color: '#2563eb', letterSpacing: 1 },
  btnDangerOutline: { paddingHorizontal: 24, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: '#fecaca', backgroundColor: Theme.screenBackground },
  btnDangerOutlineText: { fontSize: 10, fontWeight: '800', color: '#ef4444', letterSpacing: 1 },
  btnPrimaryFilled: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 32, paddingVertical: 8, borderRadius: 12, backgroundColor: Theme.primary },
  btnPrimaryFilledText: { fontSize: 10, fontWeight: '800', color: Theme.buttonPrimaryText, letterSpacing: 2 },

  tabletMainLayout: { flex: 1, flexDirection: 'row', overflow: 'hidden' },
  tabletLeftCol: { width: 450, backgroundColor: Theme.cardWhite, borderRightWidth: 1, borderRightColor: Theme.borderLight, zIndex: 10, elevation: 1 },
  tabletLeftScroll: { flex: 1, padding: 32 },
  tabletFooterWrapper: { padding: 32, backgroundColor: Theme.cardWhite, borderTopWidth: 1, borderTopColor: Theme.borderLight },

  tabletRightCol: { flex: 1, backgroundColor: Theme.surface, position: 'relative' },
  docDotsOverlay: { position: 'absolute', top: 24, left: '50%', transform: [{ translateX: -50 }], zIndex: 30, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.8)', padding: 8, borderRadius: 20, borderWidth: 1, borderColor: Theme.borderLight },
  docDot: { height: 10, borderRadius: 5 },
  docDotActive: { width: 32, backgroundColor: Theme.primary },
  docDotInactive: { width: 10, backgroundColor: Theme.borderLight },

  documentViewerContainer: { flex: 1, position: 'relative', overflow: 'hidden', padding: 48 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { fontSize: 10, fontWeight: '800', color: Theme.textMuted, letterSpacing: 2, textTransform: 'uppercase' },
  emptyStateText: { fontSize: 12, color: Theme.textMuted, fontStyle: 'italic' },
  docInfoOverlay: { position: 'absolute', top: 24, right: 32, zIndex: 30 },
  docInfoBox: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: 'rgba(255,255,255,0.9)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: Theme.borderLight, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  docFileName: { fontSize: 10, fontWeight: '800', color: Theme.textPrimaryDark, textTransform: 'uppercase', letterSpacing: -0.5, maxWidth: 200 },
  docFileSize: { fontSize: 8, fontWeight: '700', color: Theme.textMuted, textTransform: 'uppercase', letterSpacing: 2 },
  docActionIcons: { flexDirection: 'row', alignItems: 'center', gap: 4, borderLeftWidth: 1, borderLeftColor: Theme.borderLight, paddingLeft: 12 },
  docIconBtn: { padding: 8, borderRadius: 8 },

  documentStage: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  documentImage: {
    flex: 1,
    width: '100%',
    height: undefined as unknown as number,
    backgroundColor: Theme.cardWhite,
  },
  docLoadingOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.65)',
  },

  docNavBtn: {
    position: 'absolute',
    top: '50%',
    zIndex: 35,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  docNavBtnLeft: { left: 24, transform: [{ translateY: -28 }] },
  docNavBtnRight: { right: 24, transform: [{ translateY: -28 }] },

  // Catalyst-style chat terminal sidebar (desktop)
  chatSidebar: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 420,
    backgroundColor: Theme.cardWhite,
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderLight,
    zIndex: 40,
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 4,
  },
  chatSidebarHeader: {
    height: 64,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chatSidebarHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chatBotIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Theme.textPrimaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatSidebarTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  chatSidebarSub: {
    fontSize: 9,
    fontWeight: '800',
    color: Theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 2,
  },
  chatSidebarCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  chatSidebarBody: { flex: 1, padding: 16 },
});
