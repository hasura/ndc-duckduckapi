import duckdb from 'duckdb';

export class AsyncConnection {
  constructor(private connection: duckdb.Connection) {}

  async run(sql: string, ...params: any[]): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.connection.run(sql, ...params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async all(sql: string, ...params: any[]): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.connection.all(sql, ...params, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }

  close() {
    this.connection.close();
  }
}

export class DuckDBManager {
    private db: duckdb.Database;
    private connectionPool: any[];
    private maxConnections: number;
    private activeConnections: number;

    constructor(dbPath = ':memory:') {
      this.db = new duckdb.Database(dbPath);
      this.connectionPool = [];
      this.maxConnections = 5;
      this.activeConnections = 0;
    }
  
    async getConnection(): Promise<AsyncConnection> {
      if (this.activeConnections >= this.maxConnections) {
        await new Promise(resolve => setTimeout(resolve, 100));
        return this.getConnection();
      }

      const connection = await this.db.connect();
      this.activeConnections++;
      return new AsyncConnection(connection);
    }
  
    async query(sql: string, ...params: any[]) {
      const connection = await this.getConnection();
      
      try {
        const result = await connection.all(sql, ...params);
        return result;
      } catch (error) {
        throw error;
      } finally {
        this.activeConnections--;
        connection.close();
      }
    }
  
    async transaction(callback: (conn: AsyncConnection) => Promise<void>) {
      const connection = await this.getConnection();
      
      try {
        await connection.run('BEGIN TRANSACTION');
        const result = await callback(connection);
        await connection.run('COMMIT');
        return result;
      } catch (error) {
        await connection.run('ROLLBACK');
        throw error;
      } finally {
        this.activeConnections--;
        connection.close();
      }
    }
    close() {
      this.db.close();
    }
  }
