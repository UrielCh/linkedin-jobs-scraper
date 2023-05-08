import { z } from "zod";

const Enum_relevance = z.enum(["R", "DD"] as const); // z.enum(Object.values(relevanceFilter))
const Enum_timeFilter = z.enum(["", "r86400", "r604800", "r2592000" ] as const); // z.enum(Object.values(timeFilter)
const Enum_typeFilter = z.enum(["F", "P", "T", "C", "I", "V", "O" ] as const); // z.enum(Object.values(typeFilter)
const Enum_experienceLevelFilter = z.enum(["1", "2", "3", "4", "5", "6" ] as const); // Object.values(experienceLevelFilter)
const Enum_onSiteOrRemoteFilter = z.enum(["1", "2", "3" ] as const); // z.enum(Object.values(onSiteOrRemoteFilter)

const QueryOptionsSchema = z.object({
    locations: z.optional(z.array(z.string())),
    pageOffset: z.optional(z.number().int().nonnegative()),
    limit: z.optional(z.number().int().nonnegative()),
    filters: z.optional(z.object({
        companyJobsUrl: z.optional(z.string()),
        relevance: z.optional(Enum_relevance),
        time: z.optional(Enum_timeFilter),
        type: z.optional(z.union([Enum_typeFilter, z.array(Enum_typeFilter)])),
        experience: z.optional(z.union([Enum_experienceLevelFilter, z.array(Enum_experienceLevelFilter)])),
        onSiteOrRemote: z.optional(z.union([Enum_onSiteOrRemoteFilter, z.array(Enum_onSiteOrRemoteFilter)])),
    })),
    descriptionFn: z.optional(z.function()),
    optimize: z.optional(z.boolean()),
    applyLink: z.optional(z.boolean()),
    skipPromotedJobs: z.optional(z.boolean()),
})

export type IQueryOptions = z.infer<typeof QueryOptionsSchema>;


export const QuerySchema = z.object({
    query: z.optional(z.string()),
    options: z.optional(QueryOptionsSchema),
});

export type IQuery = z.infer<typeof QuerySchema>;

export interface IQueryValidationError {
    param: string;
    reason: string;
}
