export const relevanceFilter = {
    RELEVANT: "R" as const,
    RECENT: "DD" as const,
} as const;

export const timeFilter = {
    ANY: "" as const,
    DAY: "r86400" as const,
    WEEK: "r604800" as const,
    MONTH: "r2592000" as const,
}

export const typeFilter = {
    FULL_TIME: "F" as const,
    PART_TIME: "P" as const,
    TEMPORARY: "T" as const,
    CONTRACT: "C" as const,
    INTERNSHIP: "I" as const,
    VOLUNTEER: "V" as const,
    OTHER: "O" as const,
}

export const experienceLevelFilter = {
    INTERNSHIP: "1" as const,
    ENTRY_LEVEL: "2" as const,
    ASSOCIATE: "3" as const,
    MID_SENIOR: "4" as const,
    DIRECTOR: "5" as const,
    EXECUTIVE: "6" as const,
}

export const onSiteOrRemoteFilter = {
    ON_SITE: "1" as const,
    REMOTE: "2" as const,
    HYBRID: "3" as const,
}
