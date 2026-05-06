package middleware

import (
	"bytes"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

const (
	maxOperationLogBodyBytes    = 8 * 1024
	maxOperationLogSummaryBytes = 4 * 1024
)

type operationLogWriter struct {
	gin.ResponseWriter
	body bytes.Buffer
}

func (w *operationLogWriter) Write(data []byte) (int, error) {
	if remaining := maxOperationLogSummaryBytes - w.body.Len(); remaining > 0 {
		if len(data) > remaining {
			_, _ = w.body.Write(data[:remaining])
		} else {
			_, _ = w.body.Write(data)
		}
	}
	return w.ResponseWriter.Write(data)
}

func (w *operationLogWriter) WriteString(data string) (int, error) {
	if remaining := maxOperationLogSummaryBytes - w.body.Len(); remaining > 0 {
		if len(data) > remaining {
			_, _ = w.body.WriteString(data[:remaining])
		} else {
			_, _ = w.body.WriteString(data)
		}
	}
	return w.ResponseWriter.WriteString(data)
}

func OperationLog() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !shouldRecordOperationLog(c.Request.Method, c.Request.URL.Path) {
			c.Next()
			return
		}

		start := time.Now()
		payload, hasPayload := extractOperationPayload(c)
		requestSummary := buildOperationRequestSummary(payload, hasPayload)
		writer := &operationLogWriter{ResponseWriter: c.Writer}
		c.Writer = writer

		c.Next()

		role := c.GetInt("role")
		if role < common.RoleAdminUser {
			return
		}

		operatorId := c.GetInt("id")
		if operatorId == 0 {
			return
		}

		success, message := extractOperationResponse(writer.body.Bytes(), c.Writer.Status())
		model.RecordOperationLog(&model.OperationLog{
			OperatorId:       operatorId,
			OperatorUsername: c.GetString("username"),
			OperatorRole:     role,
			Action:           deriveOperationAction(c, payload, hasPayload),
			Method:           c.Request.Method,
			Path:             c.Request.URL.Path,
			Query:            truncateOperationText(c.Request.URL.RawQuery, maxOperationLogSummaryBytes),
			RequestSummary:   requestSummary,
			StatusCode:       c.Writer.Status(),
			Success:          success,
			Message:          message,
			Ip:               c.ClientIP(),
			UserAgent:        c.Request.UserAgent(),
			RequestId:        c.GetString(common.RequestIdKey),
			DurationMs:       time.Since(start).Milliseconds(),
		})
	}
}

func shouldRecordOperationLog(method string, path string) bool {
	if !strings.HasPrefix(path, "/api/") {
		return false
	}
	switch method {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		return true
	default:
		return false
	}
}

func extractOperationResponse(body []byte, statusCode int) (bool, string) {
	success := statusCode >= 200 && statusCode < 400
	if len(body) == 0 {
		return success, ""
	}

	var payload map[string]any
	if err := common.Unmarshal(body, &payload); err != nil {
		return success, ""
	}

	if value, ok := payload["success"].(bool); ok {
		success = value
	}

	if message, ok := payload["message"].(string); ok {
		return success, truncateOperationText(message, 255)
	}
	if errorValue, ok := payload["error"].(map[string]any); ok {
		if message, ok := errorValue["message"].(string); ok {
			return success, truncateOperationText(message, 255)
		}
	}
	return success, ""
}

func extractOperationPayload(c *gin.Context) (any, bool) {
	if c.Request == nil || c.Request.Body == nil {
		return nil, false
	}
	contentType := strings.ToLower(c.ContentType())
	if contentType != "json" {
		return nil, false
	}

	storage, err := common.GetBodyStorage(c)
	if err != nil || storage == nil || storage.Size() == 0 || storage.Size() > maxOperationLogBodyBytes {
		return nil, false
	}
	body, err := storage.Bytes()
	if err != nil || len(body) == 0 {
		return nil, false
	}
	if _, err = storage.Seek(0, io.SeekStart); err == nil {
		c.Request.Body = io.NopCloser(storage)
	}

	var payload any
	if err = common.Unmarshal(body, &payload); err != nil {
		return nil, false
	}
	return payload, true
}

func buildOperationRequestSummary(payload any, hasPayload bool) string {
	if !hasPayload {
		return ""
	}
	sanitized := sanitizeOperationValue(payload)
	result, err := common.Marshal(sanitized)
	if err != nil {
		return ""
	}
	return truncateOperationText(string(result), maxOperationLogSummaryBytes)
}

func deriveOperationAction(c *gin.Context, payload any, hasPayload bool) string {
	method := strings.ToUpper(c.Request.Method)
	path := c.Request.URL.Path
	data := getOperationPayloadMap(payload, hasPayload)

	switch {
	case method == http.MethodPost && path == "/api/user/manage":
		action := strings.ToLower(getOperationMapString(data, "action"))
		id := getOperationMapString(data, "id")
		switch action {
		case "promote":
			return appendOperationTarget("提升用户为管理员", id)
		case "demote":
			return appendOperationTarget("降级用户为普通用户", id)
		case "enable":
			return appendOperationTarget("启用用户", id)
		case "disable":
			return appendOperationTarget("禁用用户", id)
		case "delete":
			return appendOperationTarget("删除用户", id)
		default:
			return appendOperationTarget("执行用户管理操作", id)
		}
	case method == http.MethodPost && path == "/api/user":
		return appendOperationTarget("创建用户", getOperationMapString(data, "username"))
	case method == http.MethodPut && path == "/api/user":
		target := getOperationMapString(data, "username")
		if target == "" {
			target = getOperationMapString(data, "id")
		}
		return appendOperationTarget("更新用户", target)
	case method == http.MethodDelete && strings.HasPrefix(path, "/api/user/") && strings.HasSuffix(path, "/reset_passkey"):
		return appendOperationTarget("重置用户 Passkey", extractOperationPathID(path))
	case method == http.MethodDelete && strings.HasPrefix(path, "/api/user/") && strings.HasSuffix(path, "/2fa"):
		return appendOperationTarget("重置用户 2FA", extractOperationPathID(path))
	case method == http.MethodDelete && strings.HasPrefix(path, "/api/user/"):
		return appendOperationTarget("删除用户", extractOperationPathID(path))
	case method == http.MethodPost && path == "/api/channel":
		return appendOperationTarget("创建渠道", getOperationMapString(data, "name"))
	case method == http.MethodPut && path == "/api/channel":
		target := getOperationMapString(data, "name")
		if target == "" {
			target = getOperationMapString(data, "id")
		}
		return appendOperationTarget("更新渠道", target)
	case method == http.MethodDelete && strings.HasPrefix(path, "/api/channel/"):
		return appendOperationTarget("删除渠道", extractOperationPathID(path))
	case method == http.MethodPost && path == "/api/token":
		return appendOperationTarget("创建令牌", getOperationMapString(data, "name"))
	case method == http.MethodPut && path == "/api/token":
		target := getOperationMapString(data, "name")
		if target == "" {
			target = getOperationMapString(data, "id")
		}
		return appendOperationTarget("更新令牌", target)
	case method == http.MethodDelete && strings.HasPrefix(path, "/api/token/"):
		return appendOperationTarget("删除令牌", extractOperationPathID(path))
	case method == http.MethodPut && path == "/api/option/":
		return "更新系统设置"
	case method == http.MethodPost && path == "/api/option/rest_model_ratio":
		return "重置模型倍率"
	case method == http.MethodPost && path == "/api/option/migrate_console_setting":
		return "迁移控制台设置"
	case method == http.MethodPost && path == "/api/subscription/admin/plans":
		return appendOperationTarget("创建订阅计划", getOperationMapString(data, "title"))
	case method == http.MethodPut && strings.HasPrefix(path, "/api/subscription/admin/plans/"):
		return appendOperationTarget("更新订阅计划", extractOperationPathID(path))
	case method == http.MethodPatch && strings.HasPrefix(path, "/api/subscription/admin/plans/"):
		return appendOperationTarget("更新订阅计划状态", extractOperationPathID(path))
	case method == http.MethodPost && path == "/api/subscription/admin/bind":
		return appendOperationTarget("绑定订阅到用户", getOperationMapString(data, "user_id"))
	case method == http.MethodPost && strings.Contains(path, "/subscriptions"):
		return appendOperationTarget("创建用户订阅", extractOperationPathID(path))
	case method == http.MethodPost && strings.Contains(path, "/invalidate"):
		return appendOperationTarget("使订阅失效", extractOperationPathID(path))
	case method == http.MethodDelete && strings.Contains(path, "/user_subscriptions/"):
		return appendOperationTarget("删除用户订阅", extractOperationPathID(path))
	case method == http.MethodPost && path == "/api/custom-oauth-provider":
		return appendOperationTarget("创建自定义 OAuth 提供商", getOperationMapString(data, "name"))
	case method == http.MethodPut && strings.HasPrefix(path, "/api/custom-oauth-provider/"):
		return appendOperationTarget("更新自定义 OAuth 提供商", extractOperationPathID(path))
	case method == http.MethodDelete && strings.HasPrefix(path, "/api/custom-oauth-provider/"):
		return appendOperationTarget("删除自定义 OAuth 提供商", extractOperationPathID(path))
	case method == http.MethodPost && path == "/api/custom-oauth-provider/discovery":
		return "获取自定义 OAuth Discovery"
	case method == http.MethodPost && path == "/api/performance/reset_stats":
		return "重置性能统计"
	case method == http.MethodDelete && path == "/api/performance/disk_cache":
		return "清理磁盘缓存"
	case method == http.MethodDelete && path == "/api/performance/logs":
		return "清理日志文件"
	case method == http.MethodPost && path == "/api/performance/gc":
		return "触发 GC"
	default:
		return method + " " + path
	}
}

func getOperationPayloadMap(payload any, hasPayload bool) map[string]any {
	if !hasPayload {
		return nil
	}
	data, ok := payload.(map[string]any)
	if !ok {
		return nil
	}
	return data
}

func getOperationMapString(data map[string]any, key string) string {
	if data == nil {
		return ""
	}
	value, ok := data[key]
	if !ok || value == nil {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case float64:
		return strconv.FormatInt(int64(typed), 10)
	case int:
		return strconv.Itoa(typed)
	case int64:
		return strconv.FormatInt(typed, 10)
	case bool:
		return strconv.FormatBool(typed)
	default:
		return ""
	}
}

func appendOperationTarget(action string, target string) string {
	target = strings.TrimSpace(target)
	if target == "" {
		return action
	}
	return action + " [" + target + "]"
}

func extractOperationPathID(path string) string {
	path = strings.Trim(path, "/")
	if path == "" {
		return ""
	}
	parts := strings.Split(path, "/")
	for i := len(parts) - 1; i >= 0; i-- {
		part := strings.TrimSpace(parts[i])
		if part == "" {
			continue
		}
		if _, err := strconv.Atoi(part); err == nil {
			return part
		}
	}
	return ""
}

func sanitizeOperationValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		result := make(map[string]any, len(typed))
		count := 0
		for key, item := range typed {
			count++
			if count > 30 {
				result["__truncated__"] = true
				break
			}
			if isSensitiveOperationField(key) {
				result[key] = "***masked***"
				continue
			}
			result[key] = sanitizeOperationValue(item)
		}
		return result
	case []any:
		limit := len(typed)
		if limit > 10 {
			limit = 10
		}
		result := make([]any, 0, limit+1)
		for i := 0; i < limit; i++ {
			result = append(result, sanitizeOperationValue(typed[i]))
		}
		if len(typed) > limit {
			result = append(result, map[string]any{"__truncated_items__": len(typed) - limit})
		}
		return result
	case string:
		return truncateOperationText(typed, 120)
	default:
		return value
	}
}

func isSensitiveOperationField(key string) bool {
	key = strings.ToLower(strings.TrimSpace(key))
	sensitiveWords := []string{
		"password",
		"secret",
		"token",
		"key",
		"credential",
		"authorization",
		"cookie",
		"session",
	}
	for _, word := range sensitiveWords {
		if strings.Contains(key, word) {
			return true
		}
	}
	return false
}

func truncateOperationText(value string, maxLen int) string {
	value = strings.TrimSpace(value)
	if maxLen <= 0 || len(value) <= maxLen {
		return value
	}
	return value[:maxLen]
}
