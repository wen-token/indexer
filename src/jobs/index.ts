// Initialize all background job queues and crons.

import "@/jobs/arweave-relay";
import "@/jobs/arweave-sync";
import "@/jobs/cache-check";
import "@/jobs/events-sync";
import "@/jobs/fill-updates";
import "@/jobs/metadata-index";
import "@/jobs/order-fixes";
import "@/jobs/order-updates";
import "@/jobs/orderbook";
import "@/jobs/token-updates";
import "@/jobs/daily-volumes";
import "@/jobs/update-attribute";

// Export all job queues for monitoring through the UI.

import * as arweaveSyncBackfill from "@/jobs/arweave-sync/backfill-queue";
import * as arweaveSyncRealtime from "@/jobs/arweave-sync/realtime-queue";
import * as eventsSyncBackfill from "@/jobs/events-sync/backfill-queue";
import * as eventsSyncRealtime from "@/jobs/events-sync/realtime-queue";
import * as eventsSyncFtTransfersWriteBuffer from "@/jobs/events-sync/write-buffers/ft-transfers";
import * as eventsSyncNftTransfersWriteBuffer from "@/jobs/events-sync/write-buffers/nft-transfers";
import * as fillUpdates from "@/jobs/fill-updates/queue";
import * as metadataIndexFetch from "@/jobs/metadata-index/fetch-queue";
import * as metadataIndexProcess from "@/jobs/metadata-index/process-queue";
import * as metadataIndexProcessEmpty from "@/jobs/metadata-index/process-queue-empty";
import * as metadataIndexWrite from "@/jobs/metadata-index/write-queue";
import * as orderFixes from "@/jobs/order-fixes/queue";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import * as orderUpdatesByMaker from "@/jobs/order-updates/by-maker-queue";
import * as orderbookOrders from "@/jobs/orderbook/orders-queue";
import * as orderbookTokenSets from "@/jobs/orderbook/token-sets-queue";
import * as tokenUpdatesMintQueue from "@/jobs/token-updates/mint-queue";
import * as dailyVolumes from "@/jobs/daily-volumes/daily-volumes";
import * as handleNewSellOrder from "@/jobs/update-attribute/handle-new-sell-order";
import * as handleNewBuyOrder from "@/jobs/update-attribute/handle-new-buy-order";
import * as resyncAttributeCache from "@/jobs/update-attribute/resync-attribute-cache";
import * as resyncSlug from "@/jobs/metadata-index/resync-collection-slug";

export const allJobQueues = [
  arweaveSyncBackfill.queue,
  arweaveSyncRealtime.queue,
  eventsSyncBackfill.queue,
  eventsSyncRealtime.queue,
  eventsSyncFtTransfersWriteBuffer.queue,
  eventsSyncNftTransfersWriteBuffer.queue,
  fillUpdates.queue,
  metadataIndexFetch.queue,
  metadataIndexProcess.queue,
  metadataIndexProcessEmpty.queue,
  metadataIndexWrite.queue,
  orderFixes.queue,
  orderUpdatesById.queue,
  orderUpdatesByMaker.queue,
  orderbookOrders.queue,
  orderbookTokenSets.queue,
  tokenUpdatesMintQueue.queue,
  dailyVolumes.queue,
  handleNewSellOrder.queue,
  handleNewBuyOrder.queue,
  resyncAttributeCache.queue,
  resyncSlug.queue,
];
