import mssql from 'mssql';

export async function connect(): Promise<mssql.ConnectionPool> {
	return mssql.connect(config());
}

function config(): mssql.config {
	return {
		server: process.env.DB_HOST ?? '',
		port: Number(process.env.DB_PORT ?? 1433),
		user: process.env.DB_USERNAME,
		password: process.env.DB_PASSWORD,
		database: process.env.DB_DATABASE,
		connectionTimeout: Number(process.env.CONNECTION_TIMEOUT ?? 600000),
		requestTimeout: Number(process.env.REQUEST_TIMEOUT ?? 300000),
		options: {
			encrypt: process.env.DB_ENCRYPT === 'true',
			enableArithAbort: process.env.DB_ENABLE_ARITH_ABORT === 'true',
			trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
			trustedConnection: process.env.TRUSTED_CONNECTION === 'true'
		}
	};
}

/**
 * Splits a script on `GO` separator lines, like sqlcmd and SSMS do.
 * Limitation: a `GO` line inside a multi-line string or block comment is still treated as a separator.
 */
export function splitBatches(script: string): string[] {
	return script.split(/^[ \t]*GO[ \t]*\r?$/gim).filter((batch) => batch.trim() !== '');
}

export type BatchResult = { recordsets: mssql.IRecordSet<any>[]; rowsAffected: number[] };

/**
 * Runs each batch in order on a single connection, so USE, SET and #temp tables carry over between batches.
 */
export async function executeScript(script: string): Promise<BatchResult[]> {
	const batches = splitBatches(script);
	const pool = await new mssql.ConnectionPool({ ...config(), pool: { min: 0, max: 1 } }).connect();
	try {
		const results: BatchResult[] = [];
		for (const [index, batch] of batches.entries()) {
			try {
				const { recordsets, rowsAffected } = await pool.request().batch(batch);
				results.push({ recordsets: recordsets as mssql.IRecordSet<any>[], rowsAffected });
			} catch (err) {
				if (batches.length === 1) throw err;
				const message = err instanceof Error ? err.message : String(err);
				throw new Error(`Batch ${index + 1} of ${batches.length} failed (batches before it were executed): ${message}`);
			}
		}
		return results;
	} finally {
		await pool.close();
	}
}

export async function usingConnection<T>(callback: (connection: mssql.ConnectionPool) => Promise<T>): Promise<T> {
	const connection = await connect();

	try {
		return await callback(connection);
	} catch (err) {
		throw err;
	} finally {
		await connection.close();
	}
}

export async function usingTransaction<T>(callback: (transaction: mssql.Request) => Promise<T>): Promise<T> {
	return usingConnection(async (connection) => {
		const transaction = new mssql.Transaction(connection);

		try {
			await transaction.begin();
			const returnValue = await callback(transaction.request());
			await transaction.commit();
			return returnValue;
		} catch (err) {
			await transaction.rollback();
			throw err;
		}
	});
}

export async function startTransaction(): Promise<mssql.Transaction> {
	return usingConnection(async (connection) => {
		const transaction = new mssql.Transaction(connection);
		await transaction.begin();
		return transaction;
	});
}

export async function query(query: string, interpolations: any = null): Promise<mssql.IRecordSet<any>> {
	let connection = null;
	try {
		connection = await connect();
		const request = connection.request();
		if (interpolations) {
			Object.entries(interpolations).forEach(([key, value]) => request.input(key, value));
		}
		const { recordset } = await request.query(query);
		return recordset;
	} finally {
		await connection?.close();
	}
}

