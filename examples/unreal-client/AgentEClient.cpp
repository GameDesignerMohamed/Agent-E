/**
 * AgentE Unreal Engine Client — Implementation
 *
 * See AgentEClient.h for setup instructions.
 * TODO: Replace BuildStateJson() with your actual economy data.
 */

#include "AgentEClient.h"
#include "HttpModule.h"
#include "Interfaces/IHttpResponse.h"

UAgentEClient::UAgentEClient()
{
    PrimaryComponentTick.bCanEverTick = false;
}

void UAgentEClient::BeginPlay()
{
    Super::BeginPlay();
    UE_LOG(LogTemp, Log, TEXT("[AgentE] Client initialized, server: %s"), *ServerUrl);
}

// ─── Game Loop Integration ──────────────────────────────────────────────────

void UAgentEClient::OnGameTick()
{
    TickCounter++;
    if (TickCounter % TickInterval == 0)
    {
        SendTick();
    }
}

// ─── HTTP Communication ─────────────────────────────────────────────────────

void UAgentEClient::SendTick()
{
    FString StateJson = BuildStateJson();
    FString Body = FString::Printf(TEXT("{\"state\":%s}"), *StateJson);

    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request =
        FHttpModule::Get().CreateRequest();

    Request->SetURL(ServerUrl + TEXT("/tick"));
    Request->SetVerb(TEXT("POST"));
    Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
    Request->SetContentAsString(Body);
    Request->OnProcessRequestComplete().BindUObject(
        this, &UAgentEClient::HandleTickResponse);

    Request->ProcessRequest();
}

void UAgentEClient::CheckHealth()
{
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request =
        FHttpModule::Get().CreateRequest();

    Request->SetURL(ServerUrl + TEXT("/health"));
    Request->SetVerb(TEXT("GET"));
    Request->OnProcessRequestComplete().BindLambda(
        [](FHttpRequestPtr, FHttpResponsePtr Response, bool bSuccess) {
            if (bSuccess && Response.IsValid())
            {
                UE_LOG(LogTemp, Log, TEXT("[AgentE] Health: %s"),
                    *Response->GetContentAsString());
            }
        });

    Request->ProcessRequest();
}

// ─── State Building ─────────────────────────────────────────────────────────
// TODO: Replace this with your actual economy data

FString UAgentEClient::BuildStateJson()
{
    // Build JSON from your game's economy state
    // In production, use FJsonObject for proper serialization

    return FString::Printf(TEXT(R"({
        "tick": %d,
        "roles": ["role_a", "role_b", "role_c"],
        "resources": ["resource_x", "resource_y"],
        "currencies": ["currency_a"],
        "agentBalances": {
            "agent_1": { "currency_a": 150 },
            "agent_2": { "currency_a": 80 }
        },
        "agentRoles": {
            "agent_1": "role_a",
            "agent_2": "role_b"
        },
        "agentInventories": {
            "agent_1": { "resource_x": 2 },
            "agent_2": { "resource_y": 5 }
        },
        "marketPrices": {
            "currency_a": { "resource_x": 15, "resource_y": 50 }
        },
        "recentTransactions": []
    })"), TickCounter);
}

// ─── Response Handling ──────────────────────────────────────────────────────

void UAgentEClient::HandleTickResponse(FHttpResponsePtr Response, bool bSuccess)
{
    if (!bSuccess || !Response.IsValid())
    {
        UE_LOG(LogTemp, Warning, TEXT("[AgentE] Tick request failed"));
        return;
    }

    TSharedPtr<FJsonObject> JsonObject;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(
        Response->GetContentAsString());

    if (!FJsonSerializer::Deserialize(Reader, JsonObject) || !JsonObject.IsValid())
    {
        UE_LOG(LogTemp, Warning, TEXT("[AgentE] Failed to parse response"));
        return;
    }

    // Update health
    LastHealth = JsonObject->GetIntegerField(TEXT("health"));
    UE_LOG(LogTemp, Log, TEXT("[AgentE] Health: %d/100"), LastHealth);

    // Process adjustments
    const TArray<TSharedPtr<FJsonValue>>* Adjustments;
    if (JsonObject->TryGetArrayField(TEXT("adjustments"), Adjustments))
    {
        for (const auto& AdjValue : *Adjustments)
        {
            TSharedPtr<FJsonObject> Adj = AdjValue->AsObject();
            if (Adj.IsValid())
            {
                FString Key = Adj->GetStringField(TEXT("key"));
                float Value = Adj->GetNumberField(TEXT("value"));

                UE_LOG(LogTemp, Log, TEXT("[AgentE] Adjust %s -> %f"), *Key, Value);
                OnAdjustmentReceived.Broadcast(Key, Value);
            }
        }
    }

    // Process alerts
    const TArray<TSharedPtr<FJsonValue>>* Alerts;
    if (JsonObject->TryGetArrayField(TEXT("alerts"), Alerts))
    {
        for (const auto& AlertValue : *Alerts)
        {
            TSharedPtr<FJsonObject> Alert = AlertValue->AsObject();
            if (Alert.IsValid())
            {
                FString Principle = Alert->GetStringField(TEXT("principle"));
                FString Name = Alert->GetStringField(TEXT("name"));
                int32 Severity = Alert->GetIntegerField(TEXT("severity"));

                OnAlertReceived.Broadcast(Principle, Name, Severity);
            }
        }
    }
}
