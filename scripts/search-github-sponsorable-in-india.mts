import { Octokit } from "@octokit/core";
import { paginateGraphQL } from "@octokit/plugin-paginate-graphql";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";

const MyOctokit = Octokit.plugin(paginateGraphQL);
const octokit = new MyOctokit({ auth: process.env.GITHUB_TOKEN });

export type UserNode = {
    login: string;
    name: string;
    url: string;
    location: string;
    avatarUrl: string;
    bio: string;
    pinnedItems: PinnedItems;
}

export type PinnedItems = {
    edges: Edge[];
}

export type Edge = {
    node: Node;
}

export type Node = {
    name: string;
    description: string;
    url: string;
}

const query = `query paginate($cursor: String) {
    search(type: USER query: "location:India is:sponsorable", first: 100, after: $cursor) {
        userCount
        pageInfo {
            hasNextPage
            endCursor
        }
        nodes {
          ... on User{
            login,
            name
            url
            location
            avatarUrl
            bio
            pinnedItems(first:1) {
              edges {
                node {
                  ... on Repository{
                    name
                    description
                    url
                  }
                }
              }
            }
          }
       }
    }
}`;

const results: UserNode[] = [];
let totalExpected = 0;

try {
    for await (const result of octokit.graphql.paginate.iterator(query)) {
        totalExpected = result.search.userCount;
        const validNodes = result.search.nodes.filter((node: UserNode) => node.login !== undefined);
        results.push(...validNodes);
        
        console.log(`results: ${results.length}/${totalExpected} (fetched ${validNodes.length} in this batch)`);
        
        // Check if we have more pages
        if (!result.search.pageInfo.hasNextPage) {
            console.log("Reached end of pagination (hasNextPage: false)");
            break;
        }
        
        // GitHub Search API has a 1000 result limit, warn if we're approaching it
        if (results.length >= 1000) {
            console.warn("Warning: GitHub Search API typically limits results to 1000. This may be why we can't fetch all users.");
            break;
        }
    }
} catch (error) {
    console.error("Error during pagination:", error);
    if (results.length > 0) {
        console.log(`Saving ${results.length} results that were successfully fetched before the error.`);
    } else {
        throw error;
    }
}

console.log(`\nFinal count: ${results.length}/${totalExpected} users`);
if (results.length < totalExpected) {
    console.log("Note: GitHub Search API typically limits results to 1000 items max.");
    console.log("This is a known limitation of GitHub's Search API for large result sets.");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "..", "data");
const RESULT_FILE_PATH = path.join(DATA_DIR, "results.json");
await fs.writeFile(RESULT_FILE_PATH, JSON.stringify(results, null, 2));
