import { NextRequest, NextResponse } from 'next/server';
import { PaymentSimulationEngine } from '@/lib/simulation/engine';
import { SimulationParams } from '@/lib/simulation/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      apiKey,
      profileId,
      merchantId,
      numberOfBatches,
      batchSize,
      inputDebitPercent,
      inputCoBadgedPercent,
      inputRegulatedPercent,
      minAmount,
      maxAmount,
    } = body;

    if (!apiKey || !profileId || !merchantId) {
      return NextResponse.json({ success: false, error: 'API Key, Profile ID, and Merchant ID are required.' }, { status: 400 });
    }

    // Create simulation parameters
    const simulationParams: SimulationParams = {
      apiKey,
      profileId,
      merchantId,
      numberOfBatches: numberOfBatches || 20,
      batchSize: batchSize || 50,
      inputDebitPercent: inputDebitPercent !== undefined ? inputDebitPercent : 90,
      inputCoBadgedPercent: inputCoBadgedPercent !== undefined ? inputCoBadgedPercent : 80,
      inputRegulatedPercent: inputRegulatedPercent !== undefined ? inputRegulatedPercent : 50,
      minAmount: minAmount || 1,
      maxAmount: maxAmount || 1000,
    };

    // Create simulation engine
    const engine = new PaymentSimulationEngine(simulationParams);

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const sendEvent = (type: string, content: any) => {
            const message = `data: ${JSON.stringify({ type, content })}\n\n`;
            controller.enqueue(new TextEncoder().encode(message));
          };

          // Run the simulation and stream events
          await engine.runSimulation((event) => {
            sendEvent(event.type, event.content);
          });

          // Simulation completed successfully
          sendEvent('script_exit', { code: 0 });
          controller.close();

        } catch (error) {
          let message = 'Unknown error during simulation execution';
          if (error instanceof Error) message = error.message;
          console.error('Error running TypeScript simulation:', error);
          
          try {
            const errEvent = `data: ${JSON.stringify({ type: 'script_error', content: `Simulation error: ${message}` })}\n\n`;
            controller.enqueue(new TextEncoder().encode(errEvent));
          } catch (enqueueError) {
            console.error("Error enqueuing simulation error:", enqueueError);
          }
          controller.close();
        }
      },
      cancel(reason) {
        console.log('Stream cancelled by client:', reason);
        // TypeScript simulation doesn't need process cleanup like Python subprocess
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Error in /api/run-simulation POST handler:', error);
    let message = 'An unknown error occurred';
    if (error instanceof Error) {
        message = error.message;
    }
    return NextResponse.json({ success: false, error: 'Internal server error processing simulation request.', details: message }, { status: 500 });
  }
}
