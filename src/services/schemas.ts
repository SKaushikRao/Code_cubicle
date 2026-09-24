/**
 * GroundTruth - Zod Schemas for LLM structured output validation
 */
import { z } from 'zod';

export const ResearchPlanSchema = z.object({
  objective: z.string().min(5),
  targetEntitiesDescription: z.string(),
  geographyScope: z.string().default('Global / As specified'),
  requiredFields: z.array(z.string()).min(2),
  searchStrategies: z.object({
    explorerFocus: z.array(z.string()).min(1),
    investigatorFocus: z.array(z.string()).min(1),
  }),
  sourcePreferences: z.array(z.string()),
  verificationRequirements: z.array(z.string()),
  freshnessRequirements: z.string(),
  expectedOutputFormat: z.string(),
  potentialResearchRisks: z.array(z.string()),
  confidenceThreshold: z.number().min(0).max(1).default(0.8),
});

export const ExplorerOutputSchema = z.object({
  searchQueriesUsed: z.array(z.string()),
  discoveredEntities: z.array(
    z.object({
      name: z.string(),
      location: z.string().optional(),
      category: z.string().optional(),
      fields: z.record(
        z.string(),
        z.object({
          value: z.string(),
          sourceUrl: z.string().url().or(z.string()),
          sourceTitle: z.string(),
          supportingSnippet: z.string(),
        })
      ),
    })
  ),
  summaryOfDiscovery: z.string(),
});

export const InvestigatorOutputSchema = z.object({
  searchQueriesUsed: z.array(z.string()),
  counterEvidenceOrChallenges: z.array(
    z.object({
      entityName: z.string(),
      fieldName: z.string(),
      challengedValue: z.string().optional(),
      primaryEvidenceValue: z.string(),
      primarySourceUrl: z.string().url().or(z.string()),
      primarySourceTitle: z.string(),
      reasonForDoubtOrConflict: z.string(),
      isOutdated: z.boolean().default(false),
      supportingSnippet: z.string(),
    })
  ),
  verifiedConfirmations: z.array(
    z.object({
      entityName: z.string(),
      fieldName: z.string(),
      confirmedValue: z.string(),
      officialSourceUrl: z.string().url().or(z.string()),
      officialSourceTitle: z.string(),
      supportingSnippet: z.string(),
    })
  ),
  missingFieldsIdentified: z.array(
    z.object({
      entityName: z.string(),
      fieldName: z.string(),
      notes: z.string(),
    })
  ),
});

export const ArbiterDecisionSchema = z.object({
  entityName: z.string(),
  fieldName: z.string(),
  resolution: z.enum(['CONSENSUS', 'EXPLORER_SELECTED', 'INVESTIGATOR_SELECTED', 'UNRESOLVED']),
  resolvedValue: z.string(),
  confidenceScore: z.number().min(0).max(1),
  decisionBasis: z.string(),
  freshnessPreferenceApplied: z.boolean(),
  primarySourcePreferenceApplied: z.boolean(),
  requiresEscalatedSearch: z.boolean().default(false),
  escalatedSearchQuery: z.string().optional(),
});

export const ArbiterBatchOutputSchema = z.object({
  evaluations: z.array(ArbiterDecisionSchema),
  overallAssessment: z.string(),
  conflictsPreserved: z.array(
    z.object({
      entityName: z.string(),
      fieldName: z.string(),
      reasonForUnresolvedStatus: z.string(),
    })
  ),
});

export const DashboardSpecSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  metrics: z.array(
    z.object({
      label: z.string(),
      value: z.union([z.string(), z.number()]),
      description: z.string(),
      tone: z.enum(['positive', 'warning', 'alert', 'neutral']).default('neutral'),
    })
  ),
  charts: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      chartType: z.enum(['bar', 'pie', 'line']),
      dataKey: z.string(),
      xAxisKey: z.string(),
      description: z.string(),
      data: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
    })
  ),
  tableColumns: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      type: z.enum(['text', 'status', 'number', 'link']),
    })
  ),
  unverifiedObservations: z.array(z.string()),
});

export const AskDatasetResponseSchema = z.object({
  answer: z.string(),
  highlightEntities: z.array(z.string()).optional(),
  filteredCount: z.number().optional(),
  provenanceNote: z.string(),
});
