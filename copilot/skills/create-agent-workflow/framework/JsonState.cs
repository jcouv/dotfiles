using System.Text.Json;

namespace AgentWorkflow;

public sealed class JsonState<TState>
{
    private readonly string _path;
    private readonly JsonSerializerOptions _jsonOptions;

    private JsonState(
        string path,
        TState value,
        JsonSerializerOptions jsonOptions)
    {
        _path = path;
        Value = value;
        _jsonOptions = jsonOptions;
    }

    public TState Value { get; private set; }

    public static async Task<JsonState<TState>> LoadAsync(string path)
    {
        if (!File.Exists(path))
        {
            throw new FileNotFoundException($"State file '{path}' does not exist.", path);
        }

        return await LoadExistingAsync(path);
    }

    private static async Task<JsonState<TState>> LoadExistingAsync(string path)
    {
        await using var stream = File.OpenRead(path);
        var value = await JsonSerializer.DeserializeAsync<TState>(stream, WorkflowJsonSerializer.Options)
            ?? throw new InvalidOperationException($"State file '{path}' deserialized to null.");

        return new JsonState<TState>(path, value, WorkflowJsonSerializer.Options);
    }

    public async Task SaveAsync(TState newValue)
    {
        await AtomicJsonFile.WriteAsync(_path, newValue, _jsonOptions);
        Value = newValue;
    }
}
