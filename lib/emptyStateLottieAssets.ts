export const EMPTY_STATE_LOTTIE = {
  tripsTable: require("@/assets/Animated folder/delivery-truckcargo-truck.json"),
  transactions: require("@/assets/Animated folder/payment.json"),
  inviteReceived: require("@/assets/Animated folder/email-notification.json"),
  inviteSent: require("@/assets/Animated folder/friend-request.json"),
  auction: require("@/assets/Animated folder/auction.json"),
  /** Document checklist gap filler — delivery truck (same family as compliance / trips empty states). */
  documents: require("@/assets/Animated folder/delivery-truckcargo-truck.json"),
  /** Hard-copy POD preview slot before a photo is uploaded. */
  podUpload: require("@/assets/Animated folder/recipt check.json"),
} as const;
