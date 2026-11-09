import type { MDXComponents } from "mdx/types";
import { mdxComponents } from "@/components/course/mdx";

export function useMDXComponents(): MDXComponents {
  return mdxComponents;
}
