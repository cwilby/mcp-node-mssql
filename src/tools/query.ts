import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BaseTools } from "./base";
import * as database from "../utils/database";

export class QueryTools extends BaseTools {
    static create(server: McpServer) {
        const tools = new QueryTools();

        server.tool(
            "query",
            "Query the database with a SQL statement. Lines containing only GO split the script into batches, as in sqlcmd/SSMS.",
            { query: z.string().describe("The SQL query or script to execute") },
            tools.query.bind(tools)
        );

        return tools;
    }

    async query({ query }: { query: string }) {
        const results = await database.executeScript(query);
        const recordsets = results.flatMap((result) => result.recordsets);

        // DDL/DML return no result set; the old code read `.length` of undefined and reported a false error.
        if (recordsets.length === 0) {
            const rowsAffected = results.flatMap((result) => result.rowsAffected).reduce((sum, rows) => sum + rows, 0);
            return this.toResult(`Executed ${results.length} batch(es) successfully. Rows affected: ${rowsAffected}.`);
        }
        if (recordsets.length === 1) {
            if (!recordsets[0].length) return this.toResult("No results found for the query.");
            return this.toResult(JSON.stringify(recordsets[0]));
        }
        return this.toResult(JSON.stringify(recordsets));
    }
}
