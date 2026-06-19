using System.Text.Json;

namespace AgentWorkflow;

public sealed class JsonState<TState>
{
    private readonly string _path;
    private readonly JsonSerializerOptions _jsonOptions;
    private readonly bool _exitAfterNextSave;

    private JsonState(
        string path,
        TState value,
        JsonSerializerOptions jsonOptions,
        bool exitAfterNextSave)
    {
        _path = path;
        Value = value;
        _jsonOptions = jsonOptions;
        _exitAfterNextSave = exitAfterNextSave;
    }

    public TState Value { get; private set; }

    public static Task<JsonState<TState>> LoadAsync(string path)
    {
        return LoadAsync(path, exitAfterNextSave: false);
    }

    internal static async Task<JsonState<TState>> LoadAsync(string path, bool exitAfterNextSave)
    {
        if (!File.Exists(path))
        {
            throw new FileNotFoundException($"State file '{path}' does not exist.", path);
        }

        return await LoadExistingAsync(path, exitAfterNextSave);
    }

    private static async Task<JsonState<TState>> LoadExistingAsync(string path, bool exitAfterNextSave)
    {
        await using var stream = File.OpenRead(path);
        var value = await JsonSerializer.DeserializeAsync<TState>(stream, WorkflowJsonSerializer.Options)
            ?? throw new InvalidOperationException($"State file '{path}' deserialized to null.");

        return new JsonState<TState>(path, value, WorkflowJsonSerializer.Options, exitAfterNextSave);
    }

    public async Task SaveAsync(TState newValue)
    {
        await AtomicJsonFile.WriteAsync(_path, newValue, _jsonOptions);
        Value = newValue;

        if (_exitAfterNextSave)
        {
            throw new WorkflowCheckpointReachedException(_path);
        }
    }
}

internal sealed class WorkflowCheckpointReachedException(string statePath) : Exception
{
    public string StatePath { get; } = statePath;
}
