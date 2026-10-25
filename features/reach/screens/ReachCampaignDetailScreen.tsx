/**
 * Legacy campaign URL — detail now lives in the Pulse Boost hub rail.
 */
import { ROUTES } from "@/lib/routes";
import { Redirect } from "expo-router";

export default function ReachCampaignDetailScreen() {
  return <Redirect href={ROUTES.REACH.HOME} />;
}
