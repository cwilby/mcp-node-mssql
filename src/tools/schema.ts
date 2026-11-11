import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BaseTools } from "./base";
import * as database from "../utils/database";

// INFORMATION_SCHEMA.ROUTINES.ROUTINE_DEFINITION is cut at 4000 characters; OBJECT_DEFINITION returns the whole body.
const FULL_DEFINITION = "OBJECT_DEFINITION(OBJECT_ID(QUOTENAME(ROUTINE_SCHEMA) + '.' + QUOTENAME(ROUTINE_NAME)))";

export class SchemaTools extends BaseTools {
    static create(server: McpServer) {
        const tools = new SchemaTools();

        server.tool(
            "get-tables",
            "Get a list of all tables in the database",
            tools.getTables.bind(tools)
        );

        server.tool(
            "get-table",
            "Get a specific table by name",
            { tableName: z.string().describe("The name of the table to retrieve") },
            tools.getTable.bind(tools)
        )

        server.tool(
            "get-stored-procedures", 
            "Get a list of all stored procedures in the database", 
            tools.getStoredProcedures.bind(tools)
        );

        server.tool(
            "get-stored-procedure",
            "Get a specific stored procedure by name",
            { procedureName: z.string().describe("The name of the stored procedure to retrieve") },
            tools.getStoredProcedure.bind(tools)
        );

        return tools;
    }

    async getSchema() {
        const results = await database.query(`
            SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE
            FROM INFORMATION_SCHEMA.COLUMNS
            ORDER BY TABLE_NAME, ORDINAL_POSITION
        `);

        if (!results.length) return this.toResult("No schema found in the database.");

        const schema = results.reduce((acc, column) => {
            if (!acc[column.TABLE_NAME]) {
                acc[column.TABLE_NAME] = [];
            }
            acc[column.TABLE_NAME].push({
                columnName: column.COLUMN_NAME,
                dataType: column.DATA_TYPE,
                isNullable: column.IS_NULLABLE === "YES",
            });
            return acc;
        }, {});

        return this.toResult(`Schema found in the database:\n${JSON.stringify(schema)}`);
    }


    async getTables() {
        const tables = await database.query(`
            SELECT TABLE_NAME, TABLE_TYPE
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_TYPE = 'BASE TABLE'
        `);

        if (!tables.length) return this.toResult("No tables found in the database.");

        return this.toResult(`Tables found in the database:\n${JSON.stringify(tables)}`);
    }

    async getTable({ tableName }: { tableName: string }) {
        const table = await database.query(`
            SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = @tableName
            ORDER BY ORDINAL_POSITION
        `, { tableName });

        if (!table.length) return this.toResult(`Table with name: ${tableName} not found.`);

        const columns = table.map((col) => ({
            columnName: col.COLUMN_NAME,
            dataType: col.DATA_TYPE,
            isNullable: col.IS_NULLABLE === "YES",
        }));

        return this.toResult(`Table: ${tableName}\nColumns:\n${JSON.stringify(columns)}`);
    }

    async getStoredProcedures() {
        const procedures = await database.query(`
            SELECT ROUTINE_NAME, ROUTINE_TYPE, ${FULL_DEFINITION} AS ROUTINE_DEFINITION
            FROM INFORMATION_SCHEMA.ROUTINES
            WHERE ROUTINE_TYPE = 'PROCEDURE'
        `);

        if (!procedures.length) return this.toResult("No stored procedures found in the database.");

        return this.toResult(`Stored procedures found in the database:\n${JSON.stringify(procedures)}`);
    }

    async getStoredProcedure({ procedureName }: { procedureName: string }) {
        const procedure = await database.query(`
            SELECT ROUTINE_NAME, ROUTINE_TYPE, ${FULL_DEFINITION} AS ROUTINE_DEFINITION
            FROM INFORMATION_SCHEMA.ROUTINES
            WHERE ROUTINE_NAME = @procedureName
        `, { procedureName });

        if (!procedure.length) return this.toResult(`Stored procedure with name: ${procedureName} not found.`);

        const proc = procedure[0];
        return this.toResult(`Stored Procedure: ${proc.ROUTINE_NAME}\nType: ${proc.ROUTINE_TYPE}\nDefinition:\n\`\`\`sql\n${proc.ROUTINE_DEFINITION}\n\`\`\``);
    }
}
