## AgentE Godot Client
##
## Attach this script to any Node in your scene.
## It sends economy snapshots to the AgentE server every N ticks
## and applies the returned parameter adjustments.
##
## Setup:
##   1. Start AgentE server: npx @agent-e/server --port 3000
##   2. Attach this script to a Node
##   3. Implement _build_state() with your actual economy data
##   4. Handle adjustments in _on_adjustment()

extends Node

@export var server_url: String = "http://localhost:3000"
@export var tick_interval: int = 5

var _tick_counter: int = 0
var _http_request: HTTPRequest
var _last_health: int = 100

signal adjustment_received(key: String, value: float)
signal alert_received(principle: String, alert_name: String, severity: int)

func _ready() -> void:
	_http_request = HTTPRequest.new()
	add_child(_http_request)
	_http_request.request_completed.connect(_on_tick_response)
	print("[AgentE] Client ready, server: ", server_url)

# ─── Game Loop Integration ───────────────────────────────────────────────

## Call this from your game tick / _process / _physics_process
func on_game_tick() -> void:
	_tick_counter += 1
	if _tick_counter % tick_interval == 0:
		_send_tick()

# ─── HTTP Communication ─────────────────────────────────────────────────

func _send_tick() -> void:
	var state := _build_state()
	var body := JSON.stringify({"state": state})
	var headers := ["Content-Type: application/json"]

	_http_request.request(
		server_url + "/tick",
		headers,
		HTTPClient.METHOD_POST,
		body
	)

func check_health() -> void:
	var http := HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(
		func(_result, _code, _headers, body):
			var json = JSON.parse_string(body.get_string_from_utf8())
			if json:
				print("[AgentE] Health: ", json)
			http.queue_free()
	)
	http.request(server_url + "/health")

# ─── State Building ─────────────────────────────────────────────────────
# TODO: Replace this with your actual economy data

func _build_state() -> Dictionary:
	return {
		"tick": _tick_counter,
		"roles": ["Fighter", "Crafter", "Gatherer"],
		"resources": ["ore", "weapons"],
		"currencies": ["gold"],

		# Agent ID → { currency → balance }
		# TODO: Loop over your agents and populate
		"agentBalances": {
			"agent_1": {"gold": 150},
			"agent_2": {"gold": 80},
		},

		# Agent ID → role name
		"agentRoles": {
			"agent_1": "Fighter",
			"agent_2": "Crafter",
		},

		# Agent ID → { resource → quantity }
		"agentInventories": {
			"agent_1": {"weapons": 2},
			"agent_2": {"ore": 5},
		},

		# currency → { resource → price }
		"marketPrices": {
			"gold": {"ore": 15, "weapons": 50},
		},

		"recentTransactions": [],
	}

# ─── Response Handling ───────────────────────────────────────────────────

func _on_tick_response(
	result: int,
	response_code: int,
	_headers: PackedStringArray,
	body: PackedByteArray
) -> void:
	if result != HTTPRequest.RESULT_SUCCESS or response_code != 200:
		push_warning("[AgentE] Tick request failed: %d" % response_code)
		return

	var json = JSON.parse_string(body.get_string_from_utf8())
	if not json:
		push_warning("[AgentE] Failed to parse response")
		return

	# Update health
	_last_health = json.get("health", 100)
	print("[AgentE] Health: %d/100" % _last_health)

	# Process adjustments
	var adjustments = json.get("adjustments", [])
	for adj in adjustments:
		var key: String = adj.get("key", "")
		var value: float = adj.get("value", 0.0)
		print("[AgentE] Adjust %s → %f" % [key, value])
		adjustment_received.emit(key, value)
		# TODO: Apply to your economy params

	# Process alerts
	var alerts = json.get("alerts", [])
	for alert in alerts:
		var principle: String = alert.get("principle", "")
		var alert_name: String = alert.get("name", "")
		var severity: int = alert.get("severity", 0)
		alert_received.emit(principle, alert_name, severity)

## Get the last known economy health score (0-100)
func get_last_health() -> int:
	return _last_health
