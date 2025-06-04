import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      apiKey,
      profileId,
      // merchantId, // Clarify usage for DECIDE_MERCHANT_ID if different from profileId
      numberOfBatches,
      batchSize,
      inputDebitPercent,
      inputCoBadgedPercent,
      inputRegulatedPercent,
      minAmount,
      maxAmount,
    } = body;

    // Basic validation (more can be added)
    if (!apiKey || !profileId) {
      return NextResponse.json({ success: false, error: 'API Key and Profile ID are required.' }, { status: 400 });
    }

    const scriptPath = path.join(process.cwd(), 'src', 'app', 'pseudocode.py');
    const csvPath = path.join(process.cwd(), 'src', 'app', 'debit_routing_simulation_results.csv');

    const args: string[] = ['-u', scriptPath]; // '-u' for unbuffered stdout/stderr

    // Always pass API Key and Profile ID
    args.push('--api_key', apiKey);
    args.push('--profile_id', profileId);
    // If merchantId from UI is to be used for DECIDE_GATEWAY_MERCHANT_ID, pass it.
    // The python script currently uses profile_id for DECIDE_GATEWAY_MERCHANT_ID.
    // if (merchantId) args.push('--merchant_id_for_decide', merchantId);


    // Conditionally add other arguments
    if (numberOfBatches && Number(numberOfBatches) > 0) {
      args.push('--no_of_batches', String(numberOfBatches));
    }
    if (batchSize && Number(batchSize) > 0) {
      args.push('--batch_size', String(batchSize));
    }
    if (inputDebitPercent !== undefined && !isNaN(parseFloat(String(inputDebitPercent)))) {
      args.push('--input_debit_percent', String(inputDebitPercent));
    }
    if (inputCoBadgedPercent !== undefined && !isNaN(parseFloat(String(inputCoBadgedPercent)))) {
      args.push('--co_badged_percent', String(inputCoBadgedPercent));
    }
    if (inputRegulatedPercent !== undefined && !isNaN(parseFloat(String(inputRegulatedPercent)))) {
      args.push('--regulated_percent', String(inputRegulatedPercent));
    }
    if (minAmount && Number(minAmount) > 0) {
      args.push('--min_amount', String(minAmount));
    }
    if (maxAmount && Number(maxAmount) > 0) {
      args.push('--max_amount', String(maxAmount));
    }

    // Ensure Python is in PATH or provide full path
    // const pythonExecutable = process.env.PYTHON_EXECUTABLE || 'python3'; // Or 'python'
    // Point to the Python interpreter in the virtual environment
    // Assuming process.cwd() is the root of the Next.js project (Hyperswitch-LCR)
    const pythonExecutable = path.join(process.cwd(), '.venv', 'bin', 'python3');


    return new Promise((resolve, reject) => {
      const pythonProcess = spawn(pythonExecutable, args);

      let stdoutData = '';
      let stderrData = '';

      pythonProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
        console.log(`Python stdout: ${data}`);
      });

      pythonProcess.stderr.on('data', (data) => {
        stderrData += data.toString();
        console.error(`Python stderr: ${data}`);
      });

      pythonProcess.on('close', async (code) => {
        console.log(`Python process exited with code ${code}`);
        if (code === 0) {
          try {
            // Attempt to read CSV file
            const csvFileContent = await fs.readFile(csvPath, 'utf-8');
            // Optionally delete CSV after reading if it's meant to be transient for this request
            // await fs.unlink(csvPath); 
            resolve(NextResponse.json({
              success: true,
              consoleOutput: stdoutData + (stderrData ? `\nSTDERR:\n${stderrData}` : ''),
              csvData: csvFileContent,
            }));
          } catch (fileError) {
            console.error('Error reading CSV file:', fileError);
            resolve(NextResponse.json({
              success: true, // Script might have succeeded but CSV reading failed
              consoleOutput: stdoutData + (stderrData ? `\nSTDERR:\n${stderrData}` : ''),
              csvData: null,
              error: 'Simulation script ran, but failed to read result CSV.',
            }));
          }
        } else {
          resolve(NextResponse.json({
            success: false,
            error: `Simulation script failed with exit code ${code}.`,
            consoleOutput: stdoutData + (stderrData ? `\nSTDERR:\n${stderrData}` : ''),
          }, { status: 500 }));
        }
      });

      pythonProcess.on('error', (err) => {
        console.error('Failed to start Python subprocess.', err);
        resolve(NextResponse.json({ success: false, error: 'Failed to start simulation script.', details: err.message }, { status: 500 }));
      });
    });

  } catch (error) {
    console.error('Error in /api/run-simulation:', error);
    let message = 'An unknown error occurred';
    if (error instanceof Error) {
        message = error.message;
    }
    return NextResponse.json({ success: false, error: 'Internal server error processing simulation request.', details: message }, { status: 500 });
  }
}
