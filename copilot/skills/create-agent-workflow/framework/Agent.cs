namespace AgentWorkflow;

public static class Agent
{
    public static Task<AgentInvocation> InvokeAsync<TAgent, TInput>(TInput input, AgentJournal journal)
        where TAgent : Agent<TInput>, new()
    {
        return journal.InvokeActionAsync<TAgent, TInput>(input);
    }

    public static Task<TOutput> InvokeAsync<TAgent, TInput, TOutput>(TInput input, AgentJournal journal)
        where TAgent : Agent<TInput, TOutput>, new()
    {
        return journal.InvokeAsync<TAgent, TInput, TOutput>(input);
    }
}

public abstract class Agent<TInput>
{
    public string Name => GetType().Name;

    public abstract string Prompt(TInput input);
}

public abstract class Agent<TInput, TOutput> : Agent<TInput>
{
}
