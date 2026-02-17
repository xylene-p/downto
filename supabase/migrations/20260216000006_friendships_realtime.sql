-- Enable realtime for friendships table
ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;

-- Enable replica identity full so DELETE events include the row data
ALTER TABLE public.friendships REPLICA IDENTITY FULL;
