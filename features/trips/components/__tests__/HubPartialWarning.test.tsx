import { render } from "@testing-library/react-native";
import { HubPartialWarning } from "@/features/trips/components/HubPartialWarning";
import { hubTripCompletenessNote } from "@/features/trips/utils/hubTripListCounts.util";

jest.mock("react-native", () => jest.requireActual("react-native"));
jest.mock("@expo/vector-icons/FontAwesome", () => "FontAwesome");

describe("HubPartialWarning", () => {
  it("shows the full partial notice, untruncated, as an alert", () => {
    const message = hubTripCompletenessNote("error")!;
    const { getByText, getByLabelText } = render(<HubPartialWarning message={message} />);
    const text = getByText("Partial: couldn't load all trips (newest 400 shown)");
    expect(text.props.numberOfLines).toBeUndefined();
    expect(getByLabelText(message).props.accessibilityRole).toBe("alert");
  });

  it("renders nothing once the full list has loaded", () => {
    const { toJSON } = render(
      <HubPartialWarning message={hubTripCompletenessNote("exact")} />,
    );
    expect(toJSON()).toBeNull();
  });
});
