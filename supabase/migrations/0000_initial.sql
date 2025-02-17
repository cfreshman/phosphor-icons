-- Reset everything
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO anon;
GRANT ALL ON SCHEMA public TO authenticated;
GRANT ALL ON SCHEMA public TO service_role;

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create tables
CREATE TABLE icon_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    icon_name TEXT NOT NULL UNIQUE,
    embedding vector(1536), -- OpenAI's default embedding size
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Grant permissions to service role
GRANT ALL ON TABLE icon_embeddings TO service_role;
GRANT SELECT ON TABLE icon_embeddings TO anon;
GRANT SELECT ON TABLE icon_embeddings TO authenticated;

CREATE TABLE bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    icon_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE(user_id, icon_name)
);

-- Grant permissions for bookmarks table
GRANT ALL ON TABLE bookmarks TO authenticated;
GRANT ALL ON TABLE bookmarks TO service_role;

-- Create indexes
CREATE INDEX idx_icon_embeddings_embedding ON icon_embeddings USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX idx_bookmarks_icon_name ON bookmarks(icon_name);

-- Create function for similarity search
CREATE OR REPLACE FUNCTION match_icons(
    query_embedding vector(1536),
    match_threshold float,
    match_count int
)
RETURNS TABLE (
    id UUID,
    icon_name TEXT,
    similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER -- Change to DEFINER security to always run with owner's privileges
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        icon_embeddings.id,
        icon_embeddings.icon_name,
        1 - (icon_embeddings.embedding <=> query_embedding) as similarity
    FROM icon_embeddings
    WHERE 1 - (icon_embeddings.embedding <=> query_embedding) > match_threshold
    ORDER BY similarity DESC
    LIMIT match_count;
END;
$$;

-- Grant execute permission on match_icons function to public
GRANT EXECUTE ON FUNCTION match_icons(vector(1536), float, int) TO anon;
GRANT EXECUTE ON FUNCTION match_icons(vector(1536), float, int) TO authenticated;

-- Create RLS policies
ALTER TABLE icon_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

-- Icon embeddings policies (readable by all, writable by service role)
DROP POLICY IF EXISTS "Icon embeddings are readable by everyone" ON icon_embeddings;
CREATE POLICY "Icon embeddings are readable by everyone"
    ON icon_embeddings
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Icon embeddings are writable by service role" ON icon_embeddings;
CREATE POLICY "Icon embeddings are writable by service role"
    ON icon_embeddings
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Bookmark policies
CREATE POLICY "Users can read their own bookmarks"
    ON bookmarks
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own bookmarks"
    ON bookmarks
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bookmarks"
    ON bookmarks
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bookmarks"
    ON bookmarks
    FOR DELETE
    USING (auth.uid() = user_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers
CREATE TRIGGER update_icon_embeddings_updated_at
    BEFORE UPDATE ON icon_embeddings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bookmarks_updated_at
    BEFORE UPDATE ON bookmarks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); 