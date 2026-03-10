import mysql from "mysql2/promise";
import * as fs from "fs";
import * as dotenv from "dotenv";

dotenv.config();

const wpConfig = {
  host: process.env.WP_DB_HOST || "srv447.hstgr.io",
  user: process.env.WP_DB_USER || "u758272264_NW_DB",
  password: process.env.WP_DB_PASSWORD || "Aeiou@123",
  database: process.env.WP_DB_NAME || "u758272264_NW_DB",
  port: 3306,
};

interface TableInfo {
  table_name: string;
  table_type: string;
  engine: string;
  row_count: number;
  size_mb: number;
  collation: string;
  comment: string;
}

interface ColumnInfo {
  table_name: string;
  column_name: string;
  position: number;
  default_value: string | null;
  nullable: string;
  data_type: string;
  max_length: number | null;
  full_type: string;
  key_type: string;
  extra_info: string;
  description: string;
}

interface IndexInfo {
  table_name: string;
  index_name: string;
  columns: string;
  index_type: string;
  is_unique: boolean;
}

interface ForeignKeyInfo {
  table_name: string;
  column_name: string;
  constraint_name: string;
  references_table: string;
  references_column: string;
  on_update: string;
  on_delete: string;
}

async function exportWordPressSchema() {
  let connection: mysql.Connection | null = null;

  try {
    console.log("🔄 Connecting to WordPress database...");
    connection = await mysql.createConnection(wpConfig);
    console.log("✓ Connected successfully\n");

    // Get all tables
    console.log("📊 Fetching table information...");
    const [tables] = await connection.execute<any[]>(`
      SELECT 
        TABLE_NAME as table_name,
        TABLE_TYPE as table_type,
        ENGINE as engine,
        TABLE_ROWS as row_count,
        ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) as size_mb,
        TABLE_COLLATION as collation,
        TABLE_COMMENT as comment
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME
    `);

    // Get all columns
    console.log("📋 Fetching column information...");
    const [columns] = await connection.execute<any[]>(`
      SELECT 
        TABLE_NAME as table_name,
        COLUMN_NAME as column_name,
        ORDINAL_POSITION as position,
        COLUMN_DEFAULT as default_value,
        IS_NULLABLE as nullable,
        DATA_TYPE as data_type,
        CHARACTER_MAXIMUM_LENGTH as max_length,
        COLUMN_TYPE as full_type,
        COLUMN_KEY as key_type,
        EXTRA as extra_info,
        COLUMN_COMMENT as description
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `);

    // Get all indexes
    console.log("🔑 Fetching index information...");
    const [indexes] = await connection.execute<any[]>(`
      SELECT 
        TABLE_NAME as table_name,
        INDEX_NAME as index_name,
        GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as columns,
        INDEX_TYPE as index_type,
        CASE WHEN NON_UNIQUE = 0 THEN true ELSE false END as is_unique
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
      GROUP BY TABLE_NAME, INDEX_NAME, INDEX_TYPE, NON_UNIQUE
      ORDER BY TABLE_NAME, INDEX_NAME
    `);

    // Get foreign keys
    console.log("🔗 Fetching foreign key relationships...");
    const [foreignKeys] = await connection.execute<any[]>(`
      SELECT 
        kcu.TABLE_NAME as table_name,
        kcu.COLUMN_NAME as column_name,
        kcu.CONSTRAINT_NAME as constraint_name,
        kcu.REFERENCED_TABLE_NAME as references_table,
        kcu.REFERENCED_COLUMN_NAME as references_column,
        rc.UPDATE_RULE as on_update,
        rc.DELETE_RULE as on_delete
      FROM information_schema.KEY_COLUMN_USAGE kcu
      LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
        ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
        AND kcu.TABLE_SCHEMA = rc.CONSTRAINT_SCHEMA
      WHERE kcu.TABLE_SCHEMA = DATABASE()
        AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY kcu.TABLE_NAME, kcu.COLUMN_NAME
    `);

    // Generate documentation
    console.log("📝 Generating documentation...\n");
    const documentation = generateDocumentation(
      tables as TableInfo[],
      columns as ColumnInfo[],
      indexes as IndexInfo[],
      foreignKeys as ForeignKeyInfo[]
    );

    // Save to files
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    // Save as Markdown
    const mdFilename = `wordpress_schema_${timestamp}.md`;
    fs.writeFileSync(mdFilename, documentation.markdown);
    console.log(`✓ Markdown documentation saved: ${mdFilename}`);

    // Save as JSON
    const jsonFilename = `wordpress_schema_${timestamp}.json`;
    fs.writeFileSync(jsonFilename, documentation.json);
    console.log(`✓ JSON documentation saved: ${jsonFilename}`);

    // Save as TXT (simple format)
    const txtFilename = `wordpress_schema_${timestamp}.txt`;
    fs.writeFileSync(txtFilename, documentation.text);
    console.log(`✓ Text documentation saved: ${txtFilename}`);

    console.log("\n✅ Schema export completed successfully!");
  } catch (error) {
    console.error("❌ Error:", error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log("✓ Database connection closed");
    }
  }
}

function generateDocumentation(
  tables: TableInfo[],
  columns: ColumnInfo[],
  indexes: IndexInfo[],
  foreignKeys: ForeignKeyInfo[]
) {
  // Group data by table
  const tableMap = new Map<
    string,
    {
      info: TableInfo;
      columns: ColumnInfo[];
      indexes: IndexInfo[];
      foreignKeys: ForeignKeyInfo[];
    }
  >();

  tables.forEach((table) => {
    tableMap.set(table.table_name, {
      info: table,
      columns: columns.filter((col) => col.table_name === table.table_name),
      indexes: indexes.filter((idx) => idx.table_name === table.table_name),
      foreignKeys: foreignKeys.filter(
        (fk) => fk.table_name === table.table_name
      ),
    });
  });

  // Generate Markdown
  let markdown = `# WordPress Database Schema Documentation\n\n`;
  markdown += `Generated: ${new Date().toISOString()}\n`;
  markdown += `Database: ${wpConfig.database}\n`;
  markdown += `Total Tables: ${tables.length}\n\n`;
  markdown += `---\n\n`;

  // Table of Contents
  markdown += `## Table of Contents\n\n`;
  tables.forEach((table) => {
    markdown += `- [${table.table_name}](#${table.table_name.toLowerCase()})\n`;
  });
  markdown += `\n---\n\n`;

  // Generate Text version
  let text = `WORDPRESS DATABASE SCHEMA DOCUMENTATION\n`;
  text += `${"=".repeat(80)}\n\n`;
  text += `Generated: ${new Date().toISOString()}\n`;
  text += `Database: ${wpConfig.database}\n`;
  text += `Total Tables: ${tables.length}\n\n`;

  // Detailed documentation for each table
  tableMap.forEach((data, tableName) => {
    // Markdown format
    markdown += `## ${tableName}\n\n`;

    if (data.info.comment) {
      markdown += `**Description:** ${data.info.comment}\n\n`;
    }

    markdown += `**Details:**\n`;
    markdown += `- Engine: ${data.info.engine}\n`;
    markdown += `- Rows: ~${data.info.row_count.toLocaleString()}\n`;
    markdown += `- Size: ${data.info.size_mb} MB\n\n`;

    markdown += `### Columns\n\n`;
    markdown += `| Column | Type | Nullable | Key | Default | Extra | Description |\n`;
    markdown += `|--------|------|----------|-----|---------|-------|-------------|\n`;

    data.columns.forEach((col) => {
      markdown += `| ${col.column_name} | ${col.full_type} | ${
        col.nullable
      } | ${col.key_type || "-"} | ${col.default_value || "NULL"} | ${
        col.extra_info || "-"
      } | ${col.description || "-"} |\n`;
    });
    markdown += `\n`;

    // Indexes
    if (data.indexes.length > 0) {
      markdown += `### Indexes\n\n`;
      markdown += `| Index Name | Columns | Type | Unique |\n`;
      markdown += `|------------|---------|------|--------|\n`;
      data.indexes.forEach((idx) => {
        markdown += `| ${idx.index_name} | ${idx.columns} | ${
          idx.index_type
        } | ${idx.is_unique ? "Yes" : "No"} |\n`;
      });
      markdown += `\n`;
    }

    // Foreign Keys
    if (data.foreignKeys.length > 0) {
      markdown += `### Foreign Keys\n\n`;
      markdown += `| Column | References | On Update | On Delete |\n`;
      markdown += `|--------|------------|-----------|------------|\n`;
      data.foreignKeys.forEach((fk) => {
        markdown += `| ${fk.column_name} | ${fk.references_table}.${fk.references_column} | ${fk.on_update} | ${fk.on_delete} |\n`;
      });
      markdown += `\n`;
    }

    markdown += `---\n\n`;

    // Text format
    text += `\n${"=".repeat(80)}\n`;
    text += `TABLE: ${tableName}\n`;
    text += `${"=".repeat(80)}\n\n`;

    if (data.info.comment) {
      text += `Description: ${data.info.comment}\n\n`;
    }

    text += `Details:\n`;
    text += `  Engine: ${data.info.engine}\n`;
    text += `  Rows: ~${data.info.row_count.toLocaleString()}\n`;
    text += `  Size: ${data.info.size_mb} MB\n\n`;

    text += `Columns:\n`;
    text += `${"-".repeat(80)}\n`;
    data.columns.forEach((col) => {
      text += `  ${col.column_name}\n`;
      text += `    Type: ${col.full_type}\n`;
      text += `    Nullable: ${col.nullable}\n`;
      if (col.key_type) text += `    Key: ${col.key_type}\n`;
      if (col.default_value) text += `    Default: ${col.default_value}\n`;
      if (col.extra_info) text += `    Extra: ${col.extra_info}\n`;
      if (col.description) text += `    Description: ${col.description}\n`;
      text += `\n`;
    });

    if (data.indexes.length > 0) {
      text += `\nIndexes:\n`;
      text += `${"-".repeat(80)}\n`;
      data.indexes.forEach((idx) => {
        text += `  ${idx.index_name} (${
          idx.is_unique ? "UNIQUE" : "NON-UNIQUE"
        })\n`;
        text += `    Columns: ${idx.columns}\n`;
        text += `    Type: ${idx.index_type}\n\n`;
      });
    }

    if (data.foreignKeys.length > 0) {
      text += `\nForeign Keys:\n`;
      text += `${"-".repeat(80)}\n`;
      data.foreignKeys.forEach((fk) => {
        text += `  ${fk.column_name} -> ${fk.references_table}.${fk.references_column}\n`;
        text += `    On Update: ${fk.on_update}\n`;
        text += `    On Delete: ${fk.on_delete}\n\n`;
      });
    }
  });

  // Generate JSON
  const jsonData = {
    metadata: {
      generated: new Date().toISOString(),
      database: wpConfig.database,
      total_tables: tables.length,
    },
    tables: Array.from(tableMap.entries()).map(([name, data]) => ({
      name,
      info: data.info,
      columns: data.columns,
      indexes: data.indexes,
      foreignKeys: data.foreignKeys,
    })),
  };

  return {
    markdown,
    text,
    json: JSON.stringify(jsonData, null, 2),
  };
}

// Run the export
exportWordPressSchema()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
