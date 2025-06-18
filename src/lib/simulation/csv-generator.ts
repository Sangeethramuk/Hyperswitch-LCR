// CSV generation functions replacing Python csv module
import * as fs from 'fs';
import * as path from 'path';
import { TransactionData, CSV_HEADERS } from './types';

export class CSVGenerator {
  private csvPath: string;

  constructor() {
    // Equivalent to Python's CSV_FILENAME path construction
    const projectRoot = process.cwd();
    this.csvPath = path.join(projectRoot, 'public', 'debit_routing_simulation_results.csv');
  }

  // Equivalent to Python's write_to_csv function
  async writeToCSV(dataList: TransactionData[]): Promise<void> {
    try {
      // If no data, create empty file (equivalent to Python behavior)
      if (!dataList || dataList.length === 0) {
        await fs.promises.writeFile(this.csvPath, '', 'utf-8');
        this.emitSSEEvent('info', { message: `CSV file ${this.csvPath} cleared or created as empty.` });
        return;
      }

      // Create CSV content
      let csvContent = CSV_HEADERS.join(',') + '\n';
      
      for (const row of dataList) {
        const csvRow = CSV_HEADERS.map(header => {
          const value = row[header as keyof TransactionData];
          
          // Handle different data types and escape commas/quotes
          if (value === null || value === undefined) {
            return 'N/A';
          }
          
          const stringValue = String(value);
          
          // If value contains comma, quote, or newline, wrap in quotes and escape quotes
          if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          
          return stringValue;
        });
        
        csvContent += csvRow.join(',') + '\n';
      }

      // Write to file
      await fs.promises.writeFile(this.csvPath, csvContent, 'utf-8');
      
      this.emitSSEEvent('info', { 
        message: `Successfully wrote ${dataList.length} rows to CSV at ${this.csvPath}` 
      });
      
    } catch (error) {
      this.emitSSEEvent('error', { 
        message: `Error writing CSV file ${this.csvPath}: ${error}` 
      });
      throw error;
    }
  }

  // Helper method to emit SSE events (equivalent to Python's print statements)
  private emitSSEEvent(type: string, data: any): void {
    const eventData = JSON.stringify({ type, content: data });
    console.log(`event: ${type}\ndata: ${eventData}\n\n`);
  }

  // Get the CSV file path
  getCSVPath(): string {
    return this.csvPath;
  }

  // Get the CSV filename for download
  getCSVFilename(): string {
    return 'debit_routing_simulation_results.csv';
  }

  // Check if CSV file exists
  async csvExists(): Promise<boolean> {
    try {
      await fs.promises.access(this.csvPath);
      return true;
    } catch {
      return false;
    }
  }

  // Read CSV content (for validation/testing)
  async readCSV(): Promise<string> {
    try {
      return await fs.promises.readFile(this.csvPath, 'utf-8');
    } catch (error) {
      throw new Error(`Error reading CSV file: ${error}`);
    }
  }

  // Ensure the public directory exists
  async ensurePublicDirectory(): Promise<void> {
    const publicDir = path.dirname(this.csvPath);
    try {
      await fs.promises.mkdir(publicDir, { recursive: true });
    } catch (error) {
      // Directory might already exist, ignore error
    }
  }
}

// Utility function to convert data to CSV format (helper for testing)
export const convertToCSVRow = (data: Record<string, any>, headers: string[]): string => {
  return headers.map(header => {
    const value = data[header];
    
    if (value === null || value === undefined) {
      return 'N/A';
    }
    
    const stringValue = String(value);
    
    // Escape CSV special characters
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    
    return stringValue;
  }).join(',');
};

// Utility function to validate CSV data structure
export const validateCSVData = (data: TransactionData[]): boolean => {
  if (!Array.isArray(data)) {
    return false;
  }

  for (const row of data) {
    // Check if all required headers exist in the data
    for (const header of CSV_HEADERS) {
      if (!(header in row)) {
        console.warn(`Missing header '${header}' in CSV data row`);
        return false;
      }
    }
  }

  return true;
};
