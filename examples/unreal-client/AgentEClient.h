/**
 * AgentE Unreal Engine Client
 *
 * Add this Actor Component to any Actor in your level.
 * It sends economy snapshots to the AgentE server and applies adjustments.
 *
 * Setup:
 *   1. Start AgentE server: npx @agent-e/server --port 3000
 *   2. Add AgentEClient component to an Actor
 *   3. Implement BuildStateJson() with your actual economy data
 *   4. Handle OnAdjustmentReceived to modify your economy params
 */

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Http.h"
#include "Json.h"
#include "AgentEClient.generated.h"

USTRUCT(BlueprintType)
struct FAdjustment
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly)
    FString Key;

    UPROPERTY(BlueprintReadOnly)
    float Value;
};

USTRUCT(BlueprintType)
struct FAlert
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly)
    FString Principle;

    UPROPERTY(BlueprintReadOnly)
    FString Name;

    UPROPERTY(BlueprintReadOnly)
    int32 Severity;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(
    FOnAdjustmentReceived, const FString&, Key, float, Value);

DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(
    FOnAlertReceived, const FString&, Principle, const FString&, Name, int32, Severity);

UCLASS(ClassGroup=(Custom), meta=(BlueprintSpawnableComponent))
class YOURGAME_API UAgentEClient : public UActorComponent
{
    GENERATED_BODY()

public:
    UAgentEClient();

    // ─── Configuration ──────────────────────────────────────────────────

    /** AgentE server URL */
    UPROPERTY(EditAnywhere, Category = "AgentE")
    FString ServerUrl = TEXT("http://localhost:3000");

    /** Send tick every N game ticks */
    UPROPERTY(EditAnywhere, Category = "AgentE")
    int32 TickInterval = 5;

    // ─── Events ─────────────────────────────────────────────────────────

    /** Fired for each parameter adjustment returned by AgentE */
    UPROPERTY(BlueprintAssignable, Category = "AgentE")
    FOnAdjustmentReceived OnAdjustmentReceived;

    /** Fired for each economy alert */
    UPROPERTY(BlueprintAssignable, Category = "AgentE")
    FOnAlertReceived OnAlertReceived;

    // ─── Public API ─────────────────────────────────────────────────────

    /** Call from your game loop every tick */
    UFUNCTION(BlueprintCallable, Category = "AgentE")
    void OnGameTick();

    /** Check server health */
    UFUNCTION(BlueprintCallable, Category = "AgentE")
    void CheckHealth();

    /** Get the last known economy health score (0-100) */
    UFUNCTION(BlueprintPure, Category = "AgentE")
    int32 GetLastHealth() const { return LastHealth; }

protected:
    virtual void BeginPlay() override;

private:
    int32 TickCounter = 0;
    int32 LastHealth = 100;

    void SendTick();
    void HandleTickResponse(FHttpResponsePtr Response, bool bSuccess);
    FString BuildStateJson();
};
