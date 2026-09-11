import { NextRequest, NextResponse } from "next/server";

interface ConnectionBody {
  type: "postgres" | "mysql";
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  tableName: string;
}

interface TableRow {
  [key: string]: string | number | boolean | null;
}

export async function POST(request: NextRequest) {
  let body: ConnectionBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { type, host, port, database, user, password, tableName } = body;

  if (!host || !database || !user || !tableName) {
    return NextResponse.json(
      { error: "Missing required fields: host, database, user, tableName" },
      { status: 400 }
    );
  }

  try {
    if (type === "postgres") {
      const { Client } = await import("pg");
      const client = new Client({
        host,
        port: port || 5432,
        database,
        user,
        password,
        ssl: false,
      });
      await client.connect();
      const result = await client.query(`SELECT * FROM "${tableName}" LIMIT 10000`);
      await client.end();
      return NextResponse.json({
        columns: result.fields.map((f) => ({
          name: f.name,
          type: mapPgType(f.dataTypeID),
        })),
        rows: result.rows as TableRow[],
        rowCount: result.rowCount,
      });
    } else if (type === "mysql") {
      const mysql = await import("mysql2/promise");
      const conn = await mysql.createConnection({
        host,
        port: port || 3306,
        database,
        user,
        password,
      });
      const [rows] = await conn.execute(`SELECT * FROM \`${tableName}\` LIMIT 10000`);
      await conn.end();
      const rowArray = rows as TableRow[];
      const columns = rowArray.length > 0
        ? Object.keys(rowArray[0]).map((name) => ({
            name,
            type: inferType(rowArray[0][name]),
          }))
        : [];
      return NextResponse.json({
        columns,
        rows: rowArray,
        rowCount: rowArray.length,
      });
    } else {
      return NextResponse.json(
        { error: `Unsupported database type: ${type}` },
        { status: 400 }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function mapPgType(dataTypeId: number): "number" | "string" | "date" | "boolean" {
  // Common PostgreSQL OIDs
  if ([20, 21, 23, 700, 701, 1700, 790].includes(dataTypeId)) return "number";
  if ([16].includes(dataTypeId)) return "boolean";
  if ([1082, 1083, 1114, 1184].includes(dataTypeId)) return "date";
  return "string";
}

function inferType(value: unknown): "number" | "string" | "date" | "boolean" {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (value instanceof Date) return "date";
  if (typeof value === "string" && !isNaN(Date.parse(value)) && value.length >= 8) return "date";
  return "string";
}
