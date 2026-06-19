namespace AgentWorkflow;

public abstract class AgentAction<TAgent, TInput>
    where TAgent : AgentAction<TAgent, TInput>, new()
{
    public string Name => GetType().Name;

    public abstract string Prompt(TInput input);

    public static async Task<AgentInvocation> InvokeAndUpdateAsync<TState>(
        TInput input,
        AgentJournal journal,
        JsonState<TState> state,
        Func<TState, AgentInvocation, TState> update)
    {
        ArgumentNullException.ThrowIfNull(update);

        var invocation = await journal.InvokeActionAsync<TAgent, TInput>(input);
        await state.UpdateAsync(current => update(current, invocation));
        return invocation;
    }
}

public abstract class AgentFunc<TAgent, TInput, TOutput> : AgentAction<TAgent, TInput>
    where TAgent : AgentFunc<TAgent, TInput, TOutput>, new()
{
    public static async Task<TOutput> InvokeAndUpdateAsync<TState>(
        TInput input,
        AgentJournal journal,
        JsonState<TState> state,
        Func<TState, TOutput, TState> update)
    {
        ArgumentNullException.ThrowIfNull(update);

        var output = await journal.InvokeAsync<TAgent, TInput, TOutput>(input);
        await state.UpdateAsync(current => update(current, output));
        return output;
    }

    public virtual bool ValidateOutput(TOutput output)
    {
        return true;
    }
}
