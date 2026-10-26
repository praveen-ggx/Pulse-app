import * as indentsService from '@/features/indents/services/indents.service';
import * as directQuotesService from '@/features/indents/services/direct-quotes.service';
import { IndentDetailScreen } from '@/features/indents/components/IndentDetailScreen';

export const getIndentsByOrganization = indentsService.getIndentsByOrganization;
export const getFailedIndentsByOrganization = indentsService.getFailedIndentsByOrganization;
export const getIndentById = indentsService.getIndentById;
export const getIndentDisplayNumber = indentsService.getIndentDisplayNumber;
export const resolveSupplierTargetDisplayRate =
  indentsService.resolveSupplierTargetDisplayRate;
export const createIndent = indentsService.createIndent;
export const insertIndentStops = indentsService.insertIndentStops;
export const getMarketIndentsForOrganization = indentsService.getMarketIndentsForOrganization;
export const updateIndent = indentsService.updateIndent;
export const updateIndentDraft = indentsService.updateIndentDraft;
export const shareDraftIndent = indentsService.shareDraftIndent;
export const cancelIndent = indentsService.cancelIndent;
export type IndentRow = indentsService.IndentRow;
export type CreateIndentInput = indentsService.CreateIndentInput;
export type IndentStopInput = indentsService.IndentStopInput;
export type CirculationTarget = indentsService.CirculationTarget;
export type IndentAction = indentsService.IndentAction;

export const getMyDirectQuotes = directQuotesService.getMyDirectQuotes;
export const getDirectQuotesByIndentId = directQuotesService.getDirectQuotesByIndentId;
export const getDirectQuoteCountsByIndentIds = directQuotesService.getDirectQuoteCountsByIndentIds;
export const updateDirectQuoteStatus = directQuotesService.updateDirectQuoteStatus;
export const updateDirectQuoteAssignment = directQuotesService.updateDirectQuoteAssignment;
export type DirectQuoteRow = directQuotesService.DirectQuoteRow;

export { awardIndentToTrip, batchAwardIndentsToTrips, createTripFromAssignedIndent } from '@/features/indents/services/indentConversionService';
export type { AwardIndentOptions, BatchAwardResult, CreateTripFromAssignedIndentOptions } from '@/features/indents/services/indentConversionService';

export { IndentDetailScreen };
export { IndentBidAmountEntry } from '@/features/indents/components/bidding/IndentBidAmountEntry';
export type { IndentBidAmountEntryProps } from '@/features/indents/components/bidding/IndentBidAmountEntry';
export { IndentLiveBidsPanel } from '@/features/indents/components/bidding/IndentLiveBidsPanel';
export { IndentLiveBidCard } from '@/features/indents/components/bidding/IndentLiveBidCard';
export { IndentSupplierQuoteCard } from '@/features/indents/components/IndentSupplierQuoteCard';
export { buildIndentLiveBidsViewModel } from '@/features/indents/utils/bidding/indentLiveBids.util';
export { BidReceivedHammer } from '@/features/indents/components/bidding/BidReceivedHammer';
export {
  indentReviewHubLayout,
  indentReviewHubSpecValue,
  indentReviewHubStyles,
  indentReviewHubText,
} from '@/features/indents/styles/indentReviewHubStyles';

