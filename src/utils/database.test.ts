import { expect, test } from "bun:test";
import { splitBatches } from "./database";

test("a script without GO is one batch", () => {
    expect(splitBatches("SELECT 1")).toEqual(["SELECT 1"]);
});

test("splits on GO lines with LF or CRLF, any case, indented", () => {
    const script = "USE db\r\nGO\r\nCREATE OR ALTER PROCEDURE dbo.P AS SELECT 1\n  go  \nEXEC dbo.P\n";
    expect(splitBatches(script).map((batch) => batch.trim())).toEqual([
        "USE db",
        "CREATE OR ALTER PROCEDURE dbo.P AS SELECT 1",
        "EXEC dbo.P",
    ]);
});

test("GO inside a line or as part of a word is not a separator", () => {
    const script = "SELECT 'GO' AS x\nGOTO done\ndone: SELECT 1";
    expect(splitBatches(script)).toEqual([script]);
});

test("empty batches are dropped", () => {
    expect(splitBatches("GO\n\nGO\nSELECT 1\nGO\n")).toEqual(["\nSELECT 1\n"]);
});
