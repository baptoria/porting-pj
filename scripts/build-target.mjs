export const developer = process.env.ED4_DEVELOPER_BUILD === "1";
export const outDir = developer ? "docs/ed4-dev" : "docs/ed4";
export const base = developer ? "/porting-pj/ed4-dev/" : "/porting-pj/ed4/";
export const audience = developer ? "developer" : "public";
