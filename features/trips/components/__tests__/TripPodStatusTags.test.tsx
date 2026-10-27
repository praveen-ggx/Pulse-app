import { render } from "@testing-library/react-native";
import { TripPodStatusTags } from "@/features/trips/components/TripPodStatusTags";

jest.mock("react-native", () => jest.requireActual("react-native"));

describe("TripPodStatusTags", () => {
  it("leaves out the Soft chip when document flags were not loaded", () => {
    const { queryByText, getByText, queryByLabelText } = render(
      <TripPodStatusTags softCopyReceived={null} hardCopyReceived={false} />,
    );
    expect(queryByText("Soft")).toBeNull();
    expect(queryByLabelText("Soft copy POD missing")).toBeNull();
    expect(getByText("Hard")).toBeTruthy();
  });

  it("shows Soft missing / received only when the state is known", () => {
    const missing = render(
      <TripPodStatusTags softCopyReceived={false} hardCopyReceived={false} />,
    );
    expect(missing.getByLabelText("Soft copy POD missing")).toBeTruthy();
    const received = render(
      <TripPodStatusTags softCopyReceived hardCopyReceived />,
    );
    expect(received.getByLabelText("Soft copy POD received")).toBeTruthy();
  });
});
