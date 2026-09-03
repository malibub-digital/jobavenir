import { defineCollection, z } from 'astro:content';

const jobsCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    company: z.string().default("APEJ / Partenaire"),
    location: z.string().default("Bamako, Mali"),
    contractType: z.enum(['CDI', 'CDD', 'Stage', 'Intérim', 'Apprentissage', 'Autre']),
    opportunityType: z.enum(['JOB', 'STAGE', 'TRAINING', 'PROJECT_CALL', 'ANNOUNCEMENT']).default('JOB').optional(),
    category: z.string().default("Général"),
    domain: z.string().optional(),
    salary: z.string().optional(),
    deadline: z.string().optional(),
    publishedDate: z.string(),
    featured: z.boolean().default(false),
    excerpt: z.string(),
    originalUrl: z.string().url().optional(),
    originalSource: z.string().default("Partenaire JobAvenir"),
    heroImage: z.string().optional(),
    howToApply: z.string().optional(),
    requirements: z.array(z.string()).optional(),
    metadata: z.record(z.any()).optional(),
  }),
});

export const collections = {
  'jobs': jobsCollection,
};
