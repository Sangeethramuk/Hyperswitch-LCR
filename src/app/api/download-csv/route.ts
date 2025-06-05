import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  // const fileNameFromQuery = searchParams.get('fileName'); // If we make filename dynamic

  // For now, using the fixed filename as per current Python script behavior
  const fixedFileName = 'debit_routing_simulation_results.csv';
  const csvPath = path.join(process.cwd(), 'public', fixedFileName);

  try {
    const fileBuffer = await fs.readFile(csvPath);
    
    const headers = new Headers();
    headers.append('Content-Type', 'text/csv');
    headers.append('Content-Disposition', `attachment; filename="${fixedFileName}"`);

    return new Response(fileBuffer, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('Error reading CSV file for download:', error);
    let message = 'File not found or unreadable.';
    if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        message = 'Simulation CSV file not found. Please run a simulation first.';
    } else if (error instanceof Error) {
        message = error.message;
    }
    return NextResponse.json({ success: false, error: 'Failed to download CSV file.', details: message }, { status: 404 });
  }
}
