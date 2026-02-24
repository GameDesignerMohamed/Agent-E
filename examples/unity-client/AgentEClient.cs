/**
 * AgentE Unity Client
 *
 * Drop this script onto a GameObject in your scene.
 * It sends economy snapshots to the AgentE server every N ticks
 * and applies the returned parameter adjustments.
 *
 * Setup:
 *   1. Start AgentE server: npx @agent-e/server --port 3000
 *   2. Attach this script to a GameObject
 *   3. Implement BuildState() with your actual economy data
 *   4. Implement ApplyAdjustment() to modify your economy params
 */

using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

public class AgentEClient : MonoBehaviour
{
    [Header("Server")]
    [SerializeField] private string serverUrl = "http://localhost:3000";
    [SerializeField] private int tickInterval = 5; // Send every N game ticks

    private int tickCounter = 0;

    // ─── Game Loop Integration ──────────────────────────────────────────

    /// Call this from your game tick/update loop
    public void OnGameTick()
    {
        tickCounter++;
        if (tickCounter % tickInterval == 0)
        {
            StartCoroutine(SendTick());
        }
    }

    // ─── HTTP Communication ─────────────────────────────────────────────

    private IEnumerator SendTick()
    {
        string stateJson = BuildState();
        string body = "{\"state\":" + stateJson + "}";

        using (UnityWebRequest req = new UnityWebRequest(serverUrl + "/tick", "POST"))
        {
            byte[] bodyRaw = Encoding.UTF8.GetBytes(body);
            req.uploadHandler = new UploadHandlerRaw(bodyRaw);
            req.downloadHandler = new DownloadHandlerBuffer();
            req.SetRequestHeader("Content-Type", "application/json");

            yield return req.SendWebRequest();

            if (req.result == UnityWebRequest.Result.Success)
            {
                HandleTickResponse(req.downloadHandler.text);
            }
            else
            {
                Debug.LogWarning($"[AgentE] Tick failed: {req.error}");
            }
        }
    }

    public IEnumerator CheckHealth()
    {
        using (UnityWebRequest req = UnityWebRequest.Get(serverUrl + "/health"))
        {
            yield return req.SendWebRequest();
            if (req.result == UnityWebRequest.Result.Success)
            {
                Debug.Log($"[AgentE] Health: {req.downloadHandler.text}");
            }
        }
    }

    // ─── State Building ─────────────────────────────────────────────────
    // TODO: Replace this with your actual economy data

    private string BuildState()
    {
        // Build the JSON state snapshot from your game
        // This is a simplified example — use JsonUtility or Newtonsoft.Json
        // for production code

        return @"{
            ""tick"": " + tickCounter + @",
            ""roles"": [""role_a"", ""role_b"", ""role_c""],
            ""resources"": [""resource_x"", ""resource_y""],
            ""currencies"": [""currency_a""],
            ""agentBalances"": {
                ""agent_1"": { ""currency_a"": 150 },
                ""agent_2"": { ""currency_a"": 80 }
            },
            ""agentRoles"": {
                ""agent_1"": ""role_a"",
                ""agent_2"": ""role_b""
            },
            ""agentInventories"": {
                ""agent_1"": { ""resource_x"": 2 },
                ""agent_2"": { ""resource_y"": 5 }
            },
            ""marketPrices"": {
                ""currency_a"": { ""resource_x"": 15, ""resource_y"": 50 }
            },
            ""recentTransactions"": []
        }";
    }

    // ─── Response Handling ───────────────────────────────────────────────

    private void HandleTickResponse(string json)
    {
        // Parse the response — use JsonUtility or Newtonsoft.Json in production
        var response = JsonUtility.FromJson<TickResponse>(json);

        Debug.Log($"[AgentE] Health: {response.health}/100");

        // TODO: Apply each adjustment to your economy parameters
        // foreach (var adj in response.adjustments)
        // {
        //     ApplyAdjustment(adj.key, adj.value);
        // }
    }

    /// TODO: Implement this to modify your game's economy parameters
    private void ApplyAdjustment(string paramKey, float value)
    {
        // Example:
        // if (paramKey == "your_cost_param") economyParams.costParam = value;
        // if (paramKey == "your_yield_param") economyParams.yieldParam = value;
        Debug.Log($"[AgentE] Adjust {paramKey} → {value}");
    }

    // ─── Response Types ─────────────────────────────────────────────────

    [Serializable]
    public class TickResponse
    {
        public Adjustment[] adjustments;
        public Alert[] alerts;
        public int health;
    }

    [Serializable]
    public class Adjustment
    {
        public string key;
        public float value;
    }

    [Serializable]
    public class Alert
    {
        public string principle;
        public string name;
        public int severity;
    }
}
