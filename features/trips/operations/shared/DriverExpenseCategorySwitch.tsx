import { useRouter } from "expo-router";
import { useCallback } from "react";
import { showAppAlert } from "@/lib/appAlert";

import { DriverExpenseChipSelect } from "./DriverExpenseChipSelect";
import {
  activeDriverExpenseCategoryValue,
  DRIVER_EXPENSE_CATEGORY_OPTIONS,
  navigateDriverExpenseCategory,
  type DriverExpenseCategoryNav,
  type DriverExpenseFormKind,
} from "./driverExpenseCategoryNav.util";
import type { TripOtherExpenseCategory } from "../types";

type Props = {
  tripId: string;
  formKind: DriverExpenseFormKind;
  otherCategory: TripOtherExpenseCategory;
  onOtherCategoryChange: (category: TripOtherExpenseCategory) => void;
  /** In-page category switch (driver unified expense flow). */
  onCategoryNavChange?: (next: DriverExpenseCategoryNav) => void;
  lockCategorySwitch?: boolean;
  /**
   * Editing a saved expense: block switching between fuel / toll / other.
   * Each kind is stored in its own table, so a cross-kind switch would save a
   * NEW row and leave the original active (expense counted twice). Changing
   * the sub-category inside "other" is still allowed (same row).
   */
  lockKindSwitch?: boolean;
};

export function DriverExpenseCategorySwitch({
  tripId,
  formKind,
  otherCategory,
  onOtherCategoryChange,
  onCategoryNavChange,
  lockCategorySwitch = false,
  lockKindSwitch = false,
}: Props) {
  const router = useRouter();
  const activeValue = activeDriverExpenseCategoryValue(formKind, otherCategory);

  const handleChange = useCallback(
    (value: string) => {
      if (lockCategorySwitch) return;
      if (lockKindSwitch) {
        const targetKind: DriverExpenseFormKind =
          value === "fuel" || value === "toll" ? value : "other";
        if (targetKind !== formKind) {
          showAppAlert(
            "Can't change type while editing",
            "Delete this expense and add a new one to change it to a different type.",
          );
          return;
        }
      }

      if (onCategoryNavChange) {
        if (value === "fuel" || value === "toll") {
          if (value !== formKind) onCategoryNavChange(value);
          return;
        }
        onCategoryNavChange(value as TripOtherExpenseCategory);
        onOtherCategoryChange(value as TripOtherExpenseCategory);
        return;
      }

      if (value === "fuel" || value === "toll") {
        navigateDriverExpenseCategory(router, tripId, value, formKind);
        return;
      }
      if (formKind !== "other") {
        navigateDriverExpenseCategory(
          router,
          tripId,
          value as TripOtherExpenseCategory,
          formKind,
        );
        return;
      }
      onOtherCategoryChange(value as TripOtherExpenseCategory);
    },
    [
      formKind,
      lockCategorySwitch,
      lockKindSwitch,
      onCategoryNavChange,
      onOtherCategoryChange,
      router,
      tripId,
    ],
  );

  return (
    <DriverExpenseChipSelect
      label="Category"
      options={DRIVER_EXPENSE_CATEGORY_OPTIONS}
      value={activeValue}
      onChange={handleChange}
      columns={3}
      visualGroup="driver_expense_category"
      collapseAfterSelect
      disabled={lockCategorySwitch}
    />
  );
}
