# nihas-V1.0.87

- Round started from V1 f46d9f659.

## Indent screen: bid list only for the confirmed owner org
- The indent screen asked for market bids before its indent row loaded, so non-owner viewers triggered "unauthorized: caller must be a non-driver member" (P0001) on prod. It now waits until the indent is loaded and belongs to the viewer org.
