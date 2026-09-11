import { NextRequest, NextResponse } from "next/server";

interface ConnectBody {
  type: "postgres" | "mysql";
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export async function POST(request: NextRequest) {
  let body: ConnectBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { type, host, port, database, user, password } = body;

  if (!host || !database || !user) {
    return NextResponse.json(
      { error: "Missing required fields" },
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
      const result = await client.query(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
      );
      await client.end();
      return NextResponse.json({
        tables: result.rows.map((r: { tablename: string }) => r.tablename),
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
      const [rows] = await conn.execute(
        `SHOW TABLES`
      );
      await conn.end();
      const tables = (rows as Record<string, string>[]).map((r) => Object.values(r)[0]);
      return NextResponse.json({ tables });
    }
    return NextResponse.json({ error: "Unsupported database type" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
