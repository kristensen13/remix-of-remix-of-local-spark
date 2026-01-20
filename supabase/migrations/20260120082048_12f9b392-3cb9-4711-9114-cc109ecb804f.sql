-- First, add user_id column to track ownership
ALTER TABLE public.generated_websites 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Anyone can create websites" ON public.generated_websites;
DROP POLICY IF EXISTS "Anyone can delete websites" ON public.generated_websites;
DROP POLICY IF EXISTS "Anyone can view generated websites" ON public.generated_websites;

-- Create proper RLS policies that require authentication
-- Users can only view their own websites
CREATE POLICY "Users can view their own websites"
  ON public.generated_websites
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only create websites for themselves
CREATE POLICY "Users can create their own websites"
  ON public.generated_websites
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own websites
CREATE POLICY "Users can update their own websites"
  ON public.generated_websites
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can only delete their own websites
CREATE POLICY "Users can delete their own websites"
  ON public.generated_websites
  FOR DELETE
  USING (auth.uid() = user_id);