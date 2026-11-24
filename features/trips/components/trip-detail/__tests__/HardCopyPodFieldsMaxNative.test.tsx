/**
 * Phone pickers cannot grey out future times: a time after the ceiling ("now")
 * snaps back to it, same result as web (where later slots are disabled).
 * Earlier-than-floor picks keep the existing behaviour (ignored).
 */
jest.mock("react-native", () => jest.requireActual("react-native"));
const mockPickerProps: Record<string, unknown>[] = [];
jest.mock("@react-native-community/datetimepicker", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    mockPickerProps.push(props);
    return null;
  },
}));

import { fireEvent, render } from "@testing-library/react-native";
import { Platform } from "react-native";
import { HardCopyPodDateField } from "@/features/trips/components/trip-detail/HardCopyPodDateField";
import { HardCopyPodTimeField } from "@/features/trips/components/trip-detail/HardCopyPodTimeField";

const realOS = Platform.OS;
function setOS(os: "ios" | "android") {
  Object.defineProperty(Platform, "OS", { configurable: true, get: () => os });
}
afterEach(() => {
  setOS(realOS as "ios" | "android");
  mockPickerProps.length = 0;
});

const at = (h: number, m: number) => new Date(2026, 10, 24, h, m);
const lastPicker = () =>
  mockPickerProps[mockPickerProps.length - 1] as {
    onChange: (event: { type: string }, date?: Date) => void;
    maximumDate?: Date;
  };

describe.each(["ios", "android"] as const)("%s time picker", (os) => {
  function openTime(onChange: jest.Mock, extra: Record<string, string> = {}) {
    setOS(os);
    const screen = render(
      <HardCopyPodTimeField label="Time" value="10:00" onChange={onChange} maxTime="15:30" {...extra} />,
    );
    fireEvent.press(screen.getByLabelText("Time"));
    return lastPicker();
  }

  it("snaps a future time back to now", () => {
    const onChange = jest.fn();
    openTime(onChange).onChange({ type: "set" }, at(18, 45));
    expect(onChange).toHaveBeenLastCalledWith("15:30");
  });

  it("keeps an allowed earlier time", () => {
    const onChange = jest.fn();
    openTime(onChange).onChange({ type: "set" }, at(9, 5));
    expect(onChange).toHaveBeenLastCalledWith("09:05");
  });

  it("still ignores a time before the previous-stage floor", () => {
    const onChange = jest.fn();
    openTime(onChange, { minTime: "08:00" }).onChange({ type: "set" }, at(7, 0));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe.each(["ios", "android"] as const)("%s date picker", (os) => {
  it("passes today as the latest day", () => {
    setOS(os);
    const screen = render(
      <HardCopyPodDateField label="Date" value="2026-11-20" onChange={jest.fn()} maxDate="2026-11-24" />,
    );
    fireEvent.press(screen.getByLabelText("Date"));
    const max = lastPicker().maximumDate!;
    expect([max.getFullYear(), max.getMonth(), max.getDate()]).toEqual([2026, 10, 24]);
  });
});
