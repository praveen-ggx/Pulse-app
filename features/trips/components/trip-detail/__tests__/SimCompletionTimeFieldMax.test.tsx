/**
 * Simulate stage picker: no date/time later than now (maxDateTime); past open.
 */
jest.mock("react-native", () => jest.requireActual("react-native"));
const mockDateProps: Record<string, unknown>[] = [];
const mockTimeProps: Record<string, unknown>[] = [];
jest.mock("@/features/trips/components/trip-detail/HardCopyPodDateField", () => ({
  HardCopyPodDateField: (props: Record<string, unknown>) => {
    mockDateProps.push(props);
    return null;
  },
}));
jest.mock("@/features/trips/components/trip-detail/HardCopyPodTimeField", () => ({
  HardCopyPodTimeField: (props: Record<string, unknown>) => {
    mockTimeProps.push(props);
    return null;
  },
}));

import { render } from "@testing-library/react-native";
import { SimCompletionTimeField } from "@/features/trips/components/trip-detail/SimCompletionTimeField";

const last = <T,>(list: T[]) => list[list.length - 1]!;

function renderField(value: string, minDateTime: string | null = null) {
  const onChange = jest.fn();
  mockDateProps.length = 0;
  mockTimeProps.length = 0;
  render(
    <SimCompletionTimeField
      value={value}
      onChange={onChange}
      minDateTime={minDateTime}
      maxDateTime="2026-11-24T15:30"
    />,
  );
  return {
    onChange,
    date: last(mockDateProps) as { maxDate?: string; onChange: (d: string) => void },
    time: last(mockTimeProps) as { maxTime?: string; onChange: (t: string) => void },
  };
}

it("disables days after today and, on today, times after now", () => {
  const today = renderField("2026-11-24T10:00");
  expect(today.date.maxDate).toBe("2026-11-24");
  expect(today.time.maxTime).toBe("15:30");
  const earlier = renderField("2026-11-20T10:00");
  expect(earlier.time.maxTime).toBeUndefined();
});

it("a future day or time snaps back to now; past dates are kept", () => {
  const f = renderField("2026-11-24T10:00");
  f.date.onChange("2026-11-27");
  expect(f.onChange).toHaveBeenLastCalledWith("2026-11-24T15:30");
  f.time.onChange("18:00");
  expect(f.onChange).toHaveBeenLastCalledWith("2026-11-24T15:30");
  f.date.onChange("2026-09-02");
  expect(f.onChange).toHaveBeenLastCalledWith("2026-09-02T10:00");
});

it("still keeps the previous-stage floor (stages in order)", () => {
  const f = renderField("2026-11-24T10:00", "2026-11-22T09:00");
  f.date.onChange("2026-11-21");
  expect(f.onChange).toHaveBeenLastCalledWith("2026-11-22T09:00");
});
