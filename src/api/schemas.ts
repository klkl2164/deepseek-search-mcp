import * as z from 'zod/v4';

const query = z.string().trim().max(256).refine(value => Array.from(value).length >= 1 && Array.from(value).length <= 128, '必须为 1～128 个 Unicode 字符')
  .meta({ minLength: 1, maxLength: 128, description: 'Trimmed non-empty text, 1–128 Unicode code points.' });
export const searchInputSchema = z.strictObject({
  query,
  count: z.number().int().min(1).max(50).default(5),
  need_content: z.boolean().default(false),
  ori_question: query.optional(),
  localization: z.union([z.ipv4(), z.ipv6()]).optional(),
});
export const fetchInputSchema = (defaultMax = 12000) => z.strictObject({
  url: z.string().min(1).max(8192),
  offset: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
  max_chars: z.number().int().min(1000).max(30000).default(defaultMax),
});

export const searchResponseSchema = z.object({ results: z.array(z.object({
  title: z.string(), url: z.string().max(8192), snippet: z.string(), summary: z.string(),
  content: z.string(), site_name: z.string().nullable(), site_icon: z.string().max(8192).nullable(),
  date: z.iso.datetime({ offset: true }).nullable(),
  rerank_score: z.number().min(0).max(3), authority: z.number().int().min(-1).max(4),
})) });
export const fetchResponseSchema = z.object({ title: z.string(), content: z.string() });
export type SearchInput = z.input<typeof searchInputSchema>;
export type FetchInput = z.input<ReturnType<typeof fetchInputSchema>>;
export type FetchParams = z.output<ReturnType<typeof fetchInputSchema>>;
export type Page = z.infer<typeof fetchResponseSchema>;
