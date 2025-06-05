"use client";

import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DollarSign } from 'lucide-react';

interface SavingsByNetworkChartProps {
  csvFilePath: string;
  simulationRunId?: string | number | null;
}

interface SavingsData {
  network: string;
  totalSavings: number;
}

export function SavingsByNetworkChart({ csvFilePath, simulationRunId }: SavingsByNetworkChartProps) {
  const [savingsData, setSavingsData] = useState<SavingsData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAndProcessCsv = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(csvFilePath);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const csvText = await response.text();

        const lines = csvText.split('\n');
        const headers = lines[0].split(',').map(header => header.trim());
        const networkIndex = headers.indexOf('card_network');
        const amountIndex = headers.indexOf('amount');
        const savingsIndex = headers.indexOf('saving_percentage');
        const statusIndex = headers.indexOf('status');
        const routedIndex = headers.indexOf('is_debit_routed');

        if (networkIndex === -1 || amountIndex === -1 || savingsIndex === -1 || statusIndex === -1 || routedIndex === -1) {
          throw new Error("Missing required columns in CSV.");
        }

        const savingsMap: { [key: string]: number } = {};

        const csvRowRegex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          const values = line.split(csvRowRegex).map(value => value.trim().replace(/^"|"$/g, ''));
          
          if (values.length > Math.max(networkIndex, amountIndex, savingsIndex, statusIndex, routedIndex)) {
            const network = values[networkIndex];
            const amount = parseFloat(values[amountIndex]);
            const savingPercentage = parseFloat(values[savingsIndex]);
            const status = values[statusIndex];
            const isRouted = values[routedIndex];

            if (status === 'succeeded' && isRouted === 'Yes' && !isNaN(amount) && !isNaN(savingPercentage)) {
              const savings = amount * (savingPercentage / 100);
              savingsMap[network] = (savingsMap[network] || 0) + savings;
            }
          }
        }

        console.log("Filtered Savings Data Map:", savingsMap);

        const processedData: SavingsData[] = Object.keys(savingsMap)
          .map(network => ({
            network,
            totalSavings: parseFloat(savingsMap[network].toFixed(2)), // Round to 2 decimal places
          }))
          .sort((a, b) => b.totalSavings - a.totalSavings); // Sort by total savings descending

        setSavingsData(processedData);
      } catch (err: any) {
        console.error("Error fetching or processing CSV:", err);
        setError(err.message || "An error occurred while loading savings data.");
      } finally {
        setLoading(false);
      }
    };

    fetchAndProcessCsv();
  }, [csvFilePath, simulationRunId]);

  if (loading) {
    return (
      <Card className="shadow-sm">
        <CardHeader className="p-6">
          <CardTitle className="flex items-center"><DollarSign className="mr-2 h-5 w-5 text-primary" /> Savings by Network</CardTitle>
          <CardDescription>Total savings per network from the simulation.</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center">
          <p className="text-muted-foreground">Loading savings data...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="shadow-sm">
        <CardHeader className="p-6">
          <CardTitle className="flex items-center"><DollarSign className="mr-2 h-5 w-5 text-primary" /> Savings by Network</CardTitle>
          <CardDescription>Total savings per network from the simulation.</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center">
          <p className="text-red-500">Error: {error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!savingsData || savingsData.length === 0) {
    return (
      <Card className="shadow-sm">
        <CardHeader className="p-6">
          <CardTitle className="flex items-center"><DollarSign className="mr-2 h-5 w-5 text-primary" /> Savings by Network</CardTitle>
          <CardDescription>Total savings per network from the simulation.</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center">
          <p className="text-muted-foreground">No savings data available yet for debit routed transactions. Run a simulation.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="p-6">
        <CardTitle className="flex items-center"><DollarSign className="mr-2 h-5 w-5 text-primary" /> Savings by Network</CardTitle>
        <CardDescription>Total savings per network from the simulation.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={savingsData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="network" stroke="hsl(var(--muted-foreground))" />
            <YAxis stroke="hsl(var(--muted-foreground))" tickFormatter={(value) => `$` + value.toLocaleString()} />
            <Tooltip formatter={(value: number) => [`$` + value.toFixed(2), "Total Savings"]} />
            <Bar dataKey="totalSavings" fill="hsl(var(--chart-1))" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
} 