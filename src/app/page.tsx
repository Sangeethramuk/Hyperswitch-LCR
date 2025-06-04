"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query'; // Added for API calls
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { BottomControlsPanel, type FormValues } from '@/components/BottomControlsPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { StatsView } from '@/components/StatsView';
import { AnalyticsGraphsView } from '@/components/AnalyticsGraphsView';
// import { ProcessorsTabView } from '@/components/ProcessorsTabView'; // Tab removed
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react'; // AI Summary Re-added
import ReactMarkdown from 'react-markdown';
import type { PaymentMethod, ProcessorMetricsHistory, StructuredRule, ControlsState, OverallSRHistory, OverallSRHistoryDataPoint, TimeSeriesDataPoint, MerchantConnector, TransactionLogEntry, AISummaryInput, AISummaryOutput } from '@/lib/types';
import { PAYMENT_METHODS, /*RULE_STRATEGY_NODES*/ } from '@/lib/constants'; // RULE_STRATEGY_NODES removed
import { useToast } from '@/hooks/use-toast';
import { summarizeSimulation } from '@/ai/flows/summarize-simulation-flow'; // AI Summary Re-added
import { MiniSidebar } from '@/components/MiniSidebar';

// const SIMULATION_INTERVAL_MS = 50; // Interval between individual payment processing attempts - Old JS Sim

const LOCALSTORAGE_API_KEY = 'hyperswitch_apiKey';
const LOCALSTORAGE_PROFILE_ID = 'hyperswitch_profileId';
const LOCALSTORAGE_MERCHANT_ID = 'hyperswitch_merchantId';

// Type for the outcome of a single payment processing attempt - Old JS Sim
// interface SinglePaymentOutcome {
//   isSuccess: boolean;
//   routedProcessorId: string | null;
//   logEntry: TransactionLogEntry | null;
// }

export default function HomePage() {
  const [currentControls, setCurrentControls] = useState<FormValues | null>(null);
  const [simulationState, setSimulationState] = useState<'idle' | 'running' | 'paused'>('idle');
  // processedPaymentsCount and currentBatchNumber might be less relevant with Python script managing its own progress
  const [processedPaymentsCount, setProcessedPaymentsCount] = useState<number>(0);
  const [currentBatchNumber, setCurrentBatchNumber] = useState<number>(0);

  const [successRateHistory, setSuccessRateHistory] = useState<ProcessorMetricsHistory>([]);
  const [volumeHistory, setVolumeHistory] = useState<ProcessorMetricsHistory>([]);
  const [overallSuccessRateHistory, setOverallSuccessRateHistory] = useState<OverallSRHistory>([]);

  const [isApiCredentialsModalOpen, setIsApiCredentialsModalOpen] = useState<boolean>(false);
  const [apiKey, setApiKey] = useState<string>('');
  const [profileId, setProfileId] = useState<string>('');
  const [merchantId, setMerchantId] = useState<string>('');

  const [merchantConnectors, setMerchantConnectors] = useState<MerchantConnector[]>([]);
  const [connectorToggleStates, setConnectorToggleStates] = useState<Record<string, boolean>>({});
  const [isLoadingMerchantConnectors, setIsLoadingMerchantConnectors] = useState<boolean>(false);

  // These refs were primarily for the JS-based simulation
  // const apiCallAbortControllerRef = useRef<AbortController | null>(null);
  // const isStoppingRef = useRef(false);
  // const isProcessingBatchRef = useRef(false);

  const accumulatedProcessorStatsRef = useRef<Record<string, { successful: number; failed: number; volumeShareRaw: number }>>({});
  const accumulatedGlobalStatsRef = useRef<{ totalSuccessful: number; totalFailed: number }>({ totalSuccessful: 0, totalFailed: 0 });

  const [transactionLogs, setTransactionLogs] = useState<TransactionLogEntry[]>([]);
  const transactionCounterRef = useRef<number>(0);

  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState<boolean>(false);
  const [summaryText, setSummaryText] = useState<string>('');
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  const [summaryAttempted, setSummaryAttempted] = useState<boolean>(false);
  const [simulationCsvData, setSimulationCsvData] = useState<string | null>(null);


  const { toast } = useToast();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // const [mainPaneSize, setMainPaneSize] = useState('50%'); // Seems unused

  const [activeSection, setActiveSection] = useState('general');
  const parentTab = 'least-cost-routing';
  const [contentTab, setContentTab] = useState<'stats' | 'analytics'>('stats');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedApiKey = localStorage.getItem(LOCALSTORAGE_API_KEY);
      const storedProfileId = localStorage.getItem(LOCALSTORAGE_PROFILE_ID);
      const storedMerchantId = localStorage.getItem(LOCALSTORAGE_MERCHANT_ID);
      if (storedApiKey) setApiKey(storedApiKey);
      if (storedProfileId) setProfileId(storedProfileId);
      if (storedMerchantId) setMerchantId(storedMerchantId);
      console.log("Opening API credentials modal on page load.");
      setIsApiCredentialsModalOpen(true);
    }
  }, []);

  useEffect(() => {
    setContentTab('stats');
  }, [parentTab]);

  // Old JS-based simulation functions (fetchSuccessRateAndSelectConnector, updateSuccessRateWindow)
  // are kept for now as they might be used by other parts of the UI or AI summary,
  // but they are NOT part of the Python script execution flow.
  // Consider refactoring or removing if they become fully obsolete.
  const fetchSuccessRateAndSelectConnector = useCallback(async (
    currentControls: FormValues,
    activeConnectorLabels: string[],
    currentApiKey: string,
    currentProfileId: string
  ): Promise<{ selectedConnector: string | null; routingApproach: TransactionLogEntry['routingApproach']; srScores: Record<string, number> | undefined }> => {
    // ... (original implementation)
    if (!currentControls || activeConnectorLabels.length === 0 || !currentProfileId) {
      console.warn("[FetchSuccessRate] Missing required parameters (controls, labels, or profileId).");
      return { selectedConnector: null, routingApproach: 'unknown', srScores: undefined };
    }
    const payload = {
      id: currentProfileId, params: "card", labels: activeConnectorLabels,
      config: {
        min_aggregates_size: currentControls.minAggregatesSize ?? 5,
        exploration_percent: currentControls.explorationPercent ?? 20.0,
      },
    };
    try {
      const response = await fetch('/api/hs-proxy/dynamic-routing/success_rate.SuccessRateCalculator/FetchSuccessRate', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'x-feature': 'dynamo' }, body: JSON.stringify(payload),
      });
      const data = await response.json();
      let srScoresForLog: Record<string, number> | undefined = undefined;
      if (data.labels_with_score && Array.isArray(data.labels_with_score)) {
        srScoresForLog = data.labels_with_score.reduce((acc: Record<string, number>, item: any) => {
          if (item && typeof item.label === 'string' && typeof item.score === 'number') {
            acc[item.label] = parseFloat(item.score.toFixed(2));
          }
          return acc;
        }, {});
      }
      let routingApproachForLog: TransactionLogEntry['routingApproach'] = 'unknown';
      if (typeof data.routing_approach === 'number') {
        if (data.routing_approach === 0) routingApproachForLog = 'exploration';
        else if (data.routing_approach === 1) routingApproachForLog = 'exploitation';
      }
      if (data.labels_with_score && data.labels_with_score.length > 0) {
        const sortedConnectors = data.labels_with_score.sort((a: any, b: any) => b.score - a.score);
        return { selectedConnector: sortedConnectors[0].label, routingApproach: routingApproachForLog, srScores: srScoresForLog };
      }
      return { selectedConnector: null, routingApproach: routingApproachForLog, srScores: srScoresForLog };
    } catch (error: any) {
      console.error("[FetchSuccessRate] Fetch Error:", error);
      return { selectedConnector: null, routingApproach: 'unknown', srScores: undefined };
    }
  }, []);

  const updateSuccessRateWindow = useCallback(async (
    currentProfileId: string, connectorNameForApi: string, paymentSuccessStatus: boolean, controls: FormValues | null
  ) => {
    // ... (original implementation)
    if (!currentProfileId || !connectorNameForApi || !controls) return;
    const payload = {
      id: currentProfileId, params: "card",
      labels_with_status: [{ label: connectorNameForApi, status: paymentSuccessStatus }],
      global_labels_with_status: [{ label: connectorNameForApi, status: paymentSuccessStatus }],
      config: {
        max_aggregates_size: controls.maxAggregatesSize ?? 10,
        current_block_threshold: {
          duration_in_mins: controls.currentBlockThresholdDurationInMins ?? 60,
          max_total_count: controls.currentBlockThresholdMaxTotalCount ?? 20,
        }
      }
    };
    try {
      await fetch('/api/hs-proxy/dynamic-routing/success_rate.SuccessRateCalculator/UpdateSuccessRateWindow', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'x-feature': 'dynamo' }, body: JSON.stringify(payload),
      });
    } catch (error) { console.error("[UpdateSuccessRateWindow] Fetch Error:", error); }
  }, []);

  const runPythonSimulation = useMutation({
    mutationFn: async (params: any) => {
      const response = await fetch('/api/run-simulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', },
        body: JSON.stringify(params),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Network response was not ok" }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      return response.json();
    },
    onSuccess: (data) => {
      setSimulationState('idle');
      if (data.success) {
        toast({ title: "Python Simulation Completed", description: "Results are being processed." });
        if (data.consoleOutput) {
          const newLogEntry: TransactionLogEntry = {
            transactionNumber: transactionCounterRef.current + 1, status: 'info', connector: 'Python Script',
            timestamp: Date.now(), routingApproach: 'N/A', rawLog: data.consoleOutput,
          };
          setTransactionLogs(prevLogs => [newLogEntry, ...prevLogs]); // Prepend new log
          transactionCounterRef.current += 1;
        }
        if (data.csvData) {
          setSimulationCsvData(data.csvData);
          console.log("CSV Data received, ready for download/display.");
          // TODO: Parse CSV data to update summary metrics (overallSuccessRateHistory, accumulatedGlobalStatsRef, etc.)
          // This requires understanding the CSV structure and the Python script's summary output format.
        }
        // Consider if AI summary should be triggered here based on new data
        // if (transactionLogs.length > 0 || data.csvData) { handleRequestAiSummary(); }
      } else {
        toast({ title: "Python Simulation Failed", description: data.error || "Unknown error from script.", variant: "destructive" });
        if (data.consoleOutput) {
          const errorLogEntry: TransactionLogEntry = {
            transactionNumber: transactionCounterRef.current + 1, status: 'error', connector: 'Python Script',
            timestamp: Date.now(), routingApproach: 'N/A', rawLog: data.consoleOutput,
          };
          setTransactionLogs(prevLogs => [errorLogEntry, ...prevLogs]);
          transactionCounterRef.current += 1;
        }
      }
    },
    onError: (error: Error) => {
      setSimulationState('idle');
      toast({ title: "Simulation API Error", description: error.message, variant: "destructive" });
    },
  });

  const handleControlsChange = useCallback((data: FormValues) => {
    setCurrentControls(prev => {
      const existingOverallSuccessRate = prev ? prev.overallSuccessRate : 0;
      return { ...(prev || {}), ...data, overallSuccessRate: data.overallSuccessRate !== undefined ? data.overallSuccessRate : existingOverallSuccessRate, };
    });
  }, []);

  const fetchMerchantConnectors = async (currentMerchantId: string, currentApiKey: string): Promise<MerchantConnector[]> => {
    // ... (original implementation)
    if (!currentMerchantId || !currentApiKey || !profileId) return [];
    setIsLoadingMerchantConnectors(true);
    try {
      const response = await fetch(`https://sandbox.hyperswitch.io/account/${currentMerchantId}/profile/connectors`, {
        method: 'GET', headers: { 'api-key': currentApiKey, 'x-profile-id': profileId },
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const connectorsData: MerchantConnector[] = await response.json();
      setMerchantConnectors(connectorsData || []);
      // ... (rest of original implementation for setting initial states)
      return connectorsData || [];
    } catch (error: any) { return []; } finally { setIsLoadingMerchantConnectors(false); }
  };

  const handleConnectorToggleChange = async (connectorId: string, newState: boolean) => { /* ... (original implementation) ... */ };
  const handleApiCredentialsSubmit = () => { /* ... (original implementation) ... */ };

  const resetSimulationState = () => {
    setProcessedPaymentsCount(0); 
    setCurrentBatchNumber(0); 
    setSuccessRateHistory([]);
    setVolumeHistory([]);
    setOverallSuccessRateHistory([]);
    // isStoppingRef.current = false; // Less relevant for Python script
    accumulatedProcessorStatsRef.current = {};
    accumulatedGlobalStatsRef.current = { totalSuccessful: 0, totalFailed: 0 };
    setTransactionLogs([]);
    transactionCounterRef.current = 0;
    setSummaryAttempted(false);
    setSimulationCsvData(null); 

    setCurrentControls(prev => { /* ... (original implementation, ensure defaults are sensible) ... */ 
      if (!prev) {
        return {
          totalPayments: 1000, selectedPaymentMethods: [...PAYMENT_METHODS], processorMatrix: {},
          processorIncidents: {}, overallSuccessRate: 0, processorWiseSuccessRates: {},
          structuredRule: null, minAggregatesSize: 5, maxAggregatesSize: 10,
          numberOfBatches: 100, batchSize: 10, isSuccessBasedRoutingEnabled: true,
          debitTransactionsPercent: 0, eligibleTransactionPercent: 0, regulatedIssuerTransactionPercent: 0,
          minAmount: 0, maxAmount: 10000,
        } as FormValues;
      }
      const newPwsr: ControlsState['processorWiseSuccessRates'] = {};
      Object.keys(prev.processorWiseSuccessRates).forEach(procId => {
        newPwsr[procId] = { ...(prev.processorWiseSuccessRates[procId] || { sr: 0, srDeviation: 0 }), volumeShare: 0, successfulPaymentCount: 0, totalPaymentCount: 0 };
      });
      return { ...prev, overallSuccessRate: 0, processorWiseSuccessRates: newPwsr };
    });
  };

  // Old JS-based simulation functions - to be removed or fully replaced
  // const processSinglePayment = useCallback(async (...) => { ... }, []);
  // const getCarddetailsForPayment = (...) => { ... };
  // const processTransactionBatch = useCallback(async () => { ... }, []);
  // useEffect(() => { if(simulationState == 'running') { processTransactionBatch(); } }, [simulationState, processTransactionBatch]);


  const handleStartSimulation = useCallback(async (forceStart = false) => {
    console.log(`handleStartSimulation called. Current state: ${simulationState}, forceStart: ${forceStart}`);
    if (!apiKey || !profileId || !merchantId) {
      setIsApiCredentialsModalOpen(true);
      return;
    }
    // Fetch connectors if not already fetched or if forceStart
    if (forceStart || merchantConnectors.length === 0) {
      const connectors = await fetchMerchantConnectors(merchantId, apiKey);
      if (connectors.length === 0 && !forceStart) {
        toast({ title: "Error", description: "Failed to fetch merchant connectors. Cannot start simulation.", variant: "destructive" });
        return;
      }
    }
    if (!currentControls) {
      toast({ title: "Configuration Error", description: "Simulation controls not initialized.", variant: "destructive" });
      return;
    }
    if (simulationState === 'idle' || forceStart) {
      resetSimulationState();
    }
    setSimulationState('running'); // UI state to indicate processing / waiting for backend
    toast({ title: "Python Simulation Initiated", description: "Sending request to backend..." });

    runPythonSimulation.mutate({
      apiKey,
      profileId,
      merchantId, // Pass merchantId from state
      numberOfBatches: currentControls.numberOfBatches,
      batchSize: currentControls.batchSize,
      inputDebitPercent: currentControls.debitTransactionsPercent,
      inputCoBadgedPercent: currentControls.eligibleTransactionPercent,
      inputRegulatedPercent: currentControls.regulatedIssuerTransactionPercent,
      minAmount: currentControls.minAmount,
      maxAmount: currentControls.maxAmount,
    });
  }, [currentControls, apiKey, profileId, merchantId, toast, runPythonSimulation, simulationState, merchantConnectors.length]);

  const handlePauseSimulation = useCallback(() => {
    if (simulationState === 'running' && runPythonSimulation.isPending) {
      toast({ title: "Pause Not Supported", description: "Pausing a running backend Python script is not currently supported." });
      // Cannot truly pause backend script here. Could set UI to 'paused' but script continues.
      // setSimulationState('paused');
    } else if (simulationState === 'running') { // If it was a JS sim (now removed)
       setSimulationState('paused');
       toast({ title: "Simulation Paused (UI)" });
    }
  }, [simulationState, runPythonSimulation.isLoading, toast]);

  const handleStopSimulation = useCallback(() => {
    if (simulationState === 'running' && runPythonSimulation.isPending) {
      toast({ title: "Stop Not Supported", description: "Stopping a running backend Python script is not currently supported." });
      // Cannot truly stop backend script here.
    }
    setSimulationState('idle'); // Reset UI state
    toast({ title: "Simulation Stopped (UI)", description: "Simulation process ended or was reset." });
    // AI summary could be triggered here if results were partially received or based on last completed run
    // if (transactionLogs.length > 0 && !summaryAttempted) { handleRequestAiSummary(); }
  }, [simulationState, runPythonSimulation.isLoading, toast /*, transactionLogs, summaryAttempted, handleRequestAiSummary*/]);

  const executeAiSummary = useCallback(async () => { /* ... (original implementation) ... */ }, [currentControls, processedPaymentsCount, transactionLogs, overallSuccessRateHistory, toast, accumulatedGlobalStatsRef, accumulatedProcessorStatsRef, setIsSummaryModalOpen, setIsSummarizing, setSummaryText]);
  const handleRequestAiSummary = useCallback(() => { /* ... (original implementation) ... */ }, [currentControls, transactionLogs, toast, setSummaryAttempted, executeAiSummary]);

  useEffect(() => {
    // This effect was for JS simulation completion.
    // For Python script, AI summary should be triggered in runPythonSimulation.onSuccess
    // if (simulationState === 'idle' && processedPaymentsCount > 0 && currentControls &&
    //     processedPaymentsCount >= currentControls.totalPayments && transactionLogs.length > 0 && !summaryAttempted) {
    //   handleRequestAiSummary();
    // }
  }, [simulationState, processedPaymentsCount, currentControls, transactionLogs, handleRequestAiSummary, summaryAttempted]);

  return (
    <>
      <AppLayout>
        <div className={'theme-least-cost'}>
          <Header
            activeTab={parentTab}
            onTabChange={() => {}}
            onStartSimulation={handleStartSimulation}
            onPauseSimulation={handlePauseSimulation}
            onStopSimulation={handleStopSimulation}
            simulationState={simulationState}
            isLoading={runPythonSimulation.isPending} // Pass loading state to Header
          />
          {/* ... (rest of the JSX, ensure Transaction Logs display uses transactionLogs state) ... */}
          <div className={`flex flex-row flex-grow overflow-hidden`} style={{ height: 'calc(100vh - 64px)' }}>
            <MiniSidebar activeSection={activeSection} onSectionChange={(section) => { setActiveSection(section); setSidebarCollapsed(false); }} collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(c => !c)} />
            {!sidebarCollapsed && (
              <div className="flex flex-col min-h-screen h-auto overflow-y-auto">
                <BottomControlsPanel onFormChange={handleControlsChange} merchantConnectors={merchantConnectors} connectorToggleStates={connectorToggleStates} onConnectorToggleChange={handleConnectorToggleChange} apiKey={apiKey} profileId={profileId} merchantId={merchantId} collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(c => !c)} activeTab={activeSection} parentTab={parentTab} />
              </div>
            )}
            <div className="flex flex-col flex-1 h-full min-h-0">
              {parentTab !== 'least-cost-routing' ? (
                <Tabs value={contentTab} onValueChange={tab => setContentTab(tab as 'stats' | 'analytics')} className="flex flex-col h-full">
                  <div className="flex items-center justify-start p-4 pb-0"><TabsList><TabsTrigger value="stats">Stats</TabsTrigger><TabsTrigger value="analytics">Analytics</TabsTrigger></TabsList></div>
                  <TabsContent value="stats" className="flex-1 h-full"><ScrollArea className="h-full"><div className="p-6"><StatsView currentControls={currentControls} merchantConnectors={merchantConnectors} processedPayments={processedPaymentsCount} totalSuccessful={accumulatedGlobalStatsRef.current.totalSuccessful} totalFailed={accumulatedGlobalStatsRef.current.totalFailed} overallSuccessRateHistory={overallSuccessRateHistory} parentTab={parentTab} successRateHistory={successRateHistory} volumeHistory={volumeHistory} connectorToggleStates={connectorToggleStates} /></div></ScrollArea></TabsContent>
                  <TabsContent value="analytics" className="flex-1 h-full"><ScrollArea className="h-full"><div className="p-2 md:p-4 lg:p-6"><div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-sm p-6 mb-6"><AnalyticsGraphsView successRateHistory={successRateHistory} volumeHistory={volumeHistory} merchantConnectors={merchantConnectors} connectorToggleStates={connectorToggleStates} /></div></div></ScrollArea></TabsContent>
                </Tabs>
              ) : (
                <div className="flex flex-col h-full"><ScrollArea className="h-full"><div className="p-6"><StatsView currentControls={currentControls} merchantConnectors={merchantConnectors} processedPayments={processedPaymentsCount} totalSuccessful={accumulatedGlobalStatsRef.current.totalSuccessful} totalFailed={accumulatedGlobalStatsRef.current.totalFailed} overallSuccessRateHistory={overallSuccessRateHistory} parentTab={parentTab} successRateHistory={successRateHistory} volumeHistory={volumeHistory} connectorToggleStates={connectorToggleStates} /></div></ScrollArea></div>
              )}
            </div>
            <div className="flex flex-col h-full min-h-0 border-l p-2 md:p-4 lg:p-6 w-[400px] min-w-[300px]">
              <h2 className="text-lg font-semibold mb-2 flex-shrink-0">Transaction Logs</h2>
              {simulationCsvData && (
                <div className="mb-2">
                  <Button onClick={() => {
                    const blob = new Blob([simulationCsvData], { type: 'text/csv;charset=utf-8;' });
                    const link = document.createElement("a");
                    const url = URL.createObjectURL(blob);
                    link.setAttribute("href", url);
                    link.setAttribute("download", "debit_routing_simulation_results.csv");
                    link.style.visibility = 'hidden';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}>Download Simulation CSV</Button>
                </div>
              )}
              <div className="flex-grow min-h-0">
                <ScrollArea className="h-full">
                  {transactionLogs.length > 0 ? (
                    transactionLogs.map((log, index) => ( // Removed slice().reverse() to show new logs at bottom
                      <div key={log.transactionNumber || index} className="text-xs p-2 mb-2 border rounded-md font-mono break-all bg-card">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-sm">Log Entry #{log.transactionNumber}</span>
                          <span className="text-gray-500 dark:text-gray-400">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })}
                          </span>
                        </div>
                        {log.rawLog ? (
                          <pre className="whitespace-pre-wrap">{log.rawLog}</pre>
                        ) : (
                          <>
                            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                              <div><span className="font-semibold">Processor:</span> {log.connector}</div>
                              <div><span className="font-semibold">Status:</span> <span className={`${log.status === 'succeeded' || log.status === 'requires_capture' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{log.status}</span></div>
                              <div>
                                <span className="font-semibold">Routing:</span>
                                <span className={`
                                  ${log.routingApproach === 'exploration' ? 'text-blue-600 dark:text-blue-400' : ''}
                                  ${log.routingApproach === 'exploitation' ? 'text-purple-600 dark:text-purple-400' : ''}
                                  ${log.routingApproach === 'unknown' || log.routingApproach === 'N/A' ? 'text-gray-500 dark:text-gray-400' : ''}
                                `}>
                                  {log.routingApproach}
                                </span>
                              </div>
                            </div>
                            {log.sr_scores && Object.keys(log.sr_scores).length > 0 && (
                              <div className="mt-1 pt-1 border-t border-slate-200 dark:border-slate-700">
                                <span className="font-semibold">SR Scores:</span>
                                <div className="pl-2">
                                  {Object.entries(log.sr_scores).map(([name, score]) => (
                                    <div key={name}>{name}: {score.toFixed(2)}</div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Log entries will appear here...</p>
                  )}
                </ScrollArea>
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
      <Dialog open={isApiCredentialsModalOpen} onOpenChange={setIsApiCredentialsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>API Credentials</DialogTitle></DialogHeader>
          <div className="py-4 space-y-4">
            <div><Label htmlFor="apiKey">API Key</Label><Input id="apiKey" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Enter API Key" /></div>
            <div><Label htmlFor="profileId">Profile ID</Label><Input id="profileId" type="text" value={profileId} onChange={(e) => setProfileId(e.target.value)} placeholder="Enter Profile ID" /></div>
            <div><Label htmlFor="merchantId">Merchant ID</Label><Input id="merchantId" type="text" value={merchantId} onChange={(e) => setMerchantId(e.target.value)} placeholder="Enter Merchant ID" /></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsApiCredentialsModalOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleApiCredentialsSubmit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSummaryModalOpen} onOpenChange={setIsSummaryModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Simulation Summary</DialogTitle></DialogHeader>
          <ScrollArea className="max-h-[60vh] my-4">
            {isSummarizing ? (
              <div className="flex flex-col items-center justify-center h-40">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="mt-4 text-muted-foreground">Generating summary...</p>
              </div>
            ) : (
              <ReactMarkdown components={{ p: ({ node, ...props }) => (<p {...props} className="font-sans text-sm whitespace-pre-wrap p-1" />), }} >
                {summaryText}
              </ReactMarkdown>
            )}
          </ScrollArea>
          <DialogFooter>
            <Button type="button" onClick={() => setIsSummaryModalOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
