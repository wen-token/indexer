/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { logger } from "@/common/logger";
import { buildContinuation, fromBuffer, regex, splitContinuation } from "@/common/utils";
import {
  getJoiActivityOrderObject,
  getJoiPriceObject,
  JoiActivityOrder,
  JoiPrice,
} from "@/common/joi";
import { config } from "@/config/index";
import * as Sdk from "@reservoir0x/sdk";
import { CollectionSets } from "@/models/collection-sets";
import { Collections } from "@/models/collections";
import { redb } from "@/common/db";
import { Sort } from "@elastic/elasticsearch/lib/api/types";
import { ActivityType } from "@/elasticsearch/indexes/activities/base";

import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";

import * as Boom from "@hapi/boom";
import { ContractSets } from "@/models/contract-sets";

const version = "v1";

export const getSearchActivitiesV1Options: RouteOptions = {
  description: "Search activity",
  notes:
    "This API can be used to build a feed for a collection including sales, asks, transfers, mints, bids, cancelled bids, and cancelled asks types.",
  tags: ["api", "x-admin"],
  timeout: {
    server: 20 * 1000,
  },
  plugins: {
    "hapi-swagger": {
      order: 1,
    },
  },
  validate: {
    query: Joi.object({
      tokens: Joi.alternatives().try(
        Joi.array()
          .max(50)
          .items(Joi.string().lowercase().pattern(regex.token))
          .description(
            "Array of tokens. Max limit is 50. Example: `tokens[0]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:704 tokens[1]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:979`"
          ),
        Joi.string()
          .lowercase()
          .pattern(regex.token)
          .description(
            "Array of tokens. Max limit is 50. Example: `tokens[0]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:704 tokens[1]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:979`"
          )
      ),
      collections: Joi.alternatives().try(
        Joi.array()
          .max(50)
          .items(Joi.string().lowercase())
          .description(
            "Array of collections. Max limit is 50. Example: `collections[0]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
          ),
        Joi.string()
          .lowercase()
          .description(
            "Array of collections. Max limit is 50. Example: `collections[0]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
          )
      ),
      contractsSetId: Joi.string().lowercase().description("Filter to a particular contracts set."),
      collectionsSetId: Joi.string()
        .lowercase()
        .description("Filter to a particular collection set."),
      community: Joi.string()
        .lowercase()
        .description("Filter to a particular community. Example: `artblocks`"),
      attributes: Joi.object()
        .unknown()
        .description(
          "Filter to a particular attribute. Note: Our docs do not support this parameter correctly. To test, you can use the following URL in your browser. Example: `https://api.reservoir.tools/collections/activity/v6?collection=0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63&attribute[Type]=Original` or `https://api.reservoir.tools/collections/activity/v6?collection=0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63&attribute[Type]=Original&attribute[Type]=Sibling`"
        ),
      users: Joi.alternatives().try(
        Joi.array()
          .items(Joi.string().lowercase().pattern(regex.address))
          .min(1)
          .max(50)
          .description(
            "Array of users addresses. Max is 50. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
          ),
        Joi.string()
          .lowercase()
          .pattern(regex.address)
          .description(
            "Array of users addresses. Max is 50. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
          )
      ),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(1000)
        .default(50)
        .description(
          "Amount of items returned. Max limit is 50 when `includedMetadata=true` otherwise max limit is 1000."
        ),
      continuation: Joi.string().description(
        "Use continuation token to request next offset of items."
      ),
      types: Joi.alternatives()
        .try(
          Joi.array().items(
            Joi.string()
              .lowercase()
              .valid(..._.values(ActivityType))
          ),
          Joi.string()
            .lowercase()
            .valid(..._.values(ActivityType))
        )
        .description("Types of events returned in response. Example: 'types=sale'"),
      displayCurrency: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description("Input any ERC20 address to return result in given currency"),
    }).oxor("collections", "collectionsSetId", "contractsSetId", "community"),
  },
  response: {
    schema: Joi.object({
      continuation: Joi.string().allow(null),
      activities: Joi.array().items(
        Joi.object({
          type: Joi.string(),
          fromAddress: Joi.string(),
          toAddress: Joi.string().allow(null),
          price: JoiPrice.allow(null),
          amount: Joi.number().unsafe(),
          timestamp: Joi.number(),
          createdAt: Joi.string(),
          contract: Joi.string()
            .lowercase()
            .pattern(/^0x[a-fA-F0-9]{40}$/)
            .allow(null),
          token: Joi.object({
            id: Joi.string().allow(null),
            name: Joi.string().allow("", null),
            image: Joi.string().allow("", null),
            media: Joi.string().allow(null),
          }),
          collection: Joi.object({
            id: Joi.string().allow(null),
            name: Joi.string().allow("", null),
            image: Joi.string().allow("", null),
          }),
          txHash: Joi.string().lowercase().pattern(regex.bytes32).allow(null),
          logIndex: Joi.number().allow(null),
          batchIndex: Joi.number().allow(null),
          order: JoiActivityOrder,
        })
      ),
    }).label(`getSearchActivities${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-search-activities-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    if (!config.doElasticsearchWork) {
      throw Boom.methodNotAllowed("Elasticsearch is not available.");
    }

    const query = request.query as any;

    const esQuery = {};

    if (query.types && !_.isArray(query.types)) {
      query.types = [query.types];
    }

    (esQuery as any).bool = { filter: [] };

    if (query.types) {
      (esQuery as any).bool.filter.push({ terms: { type: query.types } });
    }

    let collectionIds: string[] = [];

    if (query.collectionsSetId) {
      collectionIds = await CollectionSets.getCollectionsIds(query.collectionsSetId);

      if (collectionIds.length === 0) {
        throw Boom.badRequest(`No collections for collection set ${query.collectionsSetId}`);
      }
    } else if (query.community) {
      collectionIds = await Collections.getIdsByCommunity(query.community);

      if (collectionIds.length === 0) {
        throw Boom.badRequest(`No collections for community ${query.community}`);
      }
    } else if (query.collections) {
      if (!_.isArray(query.collections)) {
        query.collections = [query.collections];
      }

      collectionIds = query.collections;
    }

    if (collectionIds.length) {
      (esQuery as any).bool.filter.push({
        terms: { "collection.id": collectionIds },
      });
    }

    let contracts: string[] = [];

    if (query.contractsSetId) {
      contracts = await ContractSets.getContracts(query.contractsSetId);
      if (_.isEmpty(contracts)) {
        throw Boom.badRequest(`No contracts for contracts set ${query.contractsSetId}`);
      }
    }

    if (contracts.length) {
      (esQuery as any).bool.filter.push({
        terms: { contract: contracts },
      });
    }

    let tokens: { contract: string; tokenId: string }[] = [];

    if (query.tokens) {
      if (!_.isArray(query.tokens)) {
        query.tokens = [query.tokens];
      }

      for (const token of query.tokens) {
        const [contract, tokenId] = token.split(":");

        tokens.push({
          contract,
          tokenId,
        });
      }
    } else if (query.attributes) {
      const attributes: string[] = [];

      Object.entries(query.attributes).forEach(([key, values]) => {
        (Array.isArray(values) ? values : [values]).forEach((value) =>
          attributes.push(`('${key}', '${value}')`)
        );
      });

      const tokensResult = await redb.manyOrNone(`
            SELECT contract, token_id
            FROM token_attributes
            WHERE collection_id IN ('${collectionIds.join(",")}')
            AND (key, value) IN (${attributes.join(",")});
          `);

      tokens = _.map(tokensResult, (token) => ({
        contract: fromBuffer(token.contract),
        tokenId: token.token_id,
      }));
    }

    if (tokens.length) {
      const tokensFilter = { bool: { should: [] } };

      for (const token of tokens) {
        (tokensFilter as any).bool.should.push({
          bool: {
            must: [
              {
                term: { contract: token.contract },
              },
              {
                term: { ["token.id"]: token.tokenId },
              },
            ],
          },
        });
      }

      (esQuery as any).bool.filter.push(tokensFilter);
    }

    if (query.users) {
      if (!_.isArray(query.users)) {
        query.users = [query.users];
      }

      const usersFilter = { bool: { should: [] } };

      (usersFilter as any).bool.should.push({
        terms: { fromAddress: query.users },
      });

      (usersFilter as any).bool.should.push({
        terms: { toAddress: query.users },
      });

      (esQuery as any).bool.filter.push(usersFilter);
    }

    const esSort: any[] = [];

    esSort.push({ timestamp: { order: "desc" } });

    let searchAfter;

    if (query.continuation) {
      searchAfter = [splitContinuation(query.continuation)[0]];
    }

    try {
      const activities = await ActivitiesIndex.search({
        query: esQuery,
        sort: esSort as Sort,
        size: query.limit,
        search_after: searchAfter,
      });

      // If no activities found
      if (!activities.length) {
        return { activities: [] };
      }

      const result = _.map(activities, async (activity) => {
        const currency = activity.pricing?.currency ?? Sdk.Common.Addresses.Eth[config.chainId];

        return {
          type: activity.type,
          fromAddress: activity.fromAddress,
          toAddress: activity.toAddress,
          price: activity.pricing
            ? await getJoiPriceObject(
                {
                  gross: {
                    amount: String(activity.pricing.currencyPrice ?? activity.pricing.price),
                    nativeAmount: String(activity.pricing.price),
                  },
                  net: activity.pricing.value
                    ? {
                        amount: String(activity.pricing.currencyValue ?? activity.pricing.value),
                        nativeAmount: String(activity.pricing.value),
                      }
                    : undefined,
                },
                currency,
                query.displayCurrency
              )
            : undefined,
          amount: activity.amount,
          timestamp: activity.event?.timestamp,
          createdAt: new Date(activity.createdAt).toISOString(),
          contract: activity.contract,
          token: {
            id: activity.token?.id,
            name: activity.token?.name,
            image: activity.token?.image,
            media: activity.token?.media,
          },
          collection: {
            id: activity.collection?.id,
            name: activity.collection?.name,
            image: activity.collection?.image,
          },
          txHash: activity.event?.txHash,
          logIndex: activity.event?.logIndex,
          batchIndex: activity.event?.batchIndex,
          order: activity.order?.id
            ? await getJoiActivityOrderObject({
                id: activity.order.id,
                side: activity.order.side,
                sourceIdInt: activity.order.sourceId,
                criteria: activity.order.criteria,
              })
            : undefined,
        };
      });

      // Set the continuation node
      let continuation = null;
      if (activities.length === query.limit) {
        const lastActivity = _.last(activities);

        if (lastActivity) {
          const continuationValue = lastActivity.timestamp;
          continuation = buildContinuation(`${continuationValue}`);
        }
      }

      return { activities: await Promise.all(result), continuation };
    } catch (error) {
      logger.error(`get-search-activities-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
