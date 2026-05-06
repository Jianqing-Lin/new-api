package controller

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func GetOperationLogs(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	operator := c.Query("operator")
	method := c.Query("method")
	action := c.Query("action")
	path := c.Query("path")
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	statusCode, _ := strconv.Atoi(c.Query("status_code"))

	var successFilter *bool
	if successValue := c.Query("success"); successValue != "" {
		if parsed, err := strconv.ParseBool(successValue); err == nil {
			successFilter = &parsed
		}
	}

	logs, total, err := model.GetOperationLogs(
		operator,
		method,
		action,
		path,
		startTimestamp,
		endTimestamp,
		successFilter,
		statusCode,
		pageInfo.GetStartIdx(),
		pageInfo.GetPageSize(),
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(logs)
	common.ApiSuccess(c, pageInfo)
}

func ExportOperationLogs(c *gin.Context) {
	operator := c.Query("operator")
	method := c.Query("method")
	action := c.Query("action")
	path := c.Query("path")
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	statusCode, _ := strconv.Atoi(c.Query("status_code"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10000"))

	var successFilter *bool
	if successValue := c.Query("success"); successValue != "" {
		if parsed, err := strconv.ParseBool(successValue); err == nil {
			successFilter = &parsed
		}
	}

	logs, err := model.GetOperationLogsForExport(
		operator,
		method,
		action,
		path,
		startTimestamp,
		endTimestamp,
		successFilter,
		statusCode,
		limit,
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	buffer := &bytes.Buffer{}
	buffer.WriteString("\xEF\xBB\xBF")
	writer := csv.NewWriter(buffer)
	_ = writer.Write([]string{
		"created_at",
		"operator_username",
		"operator_role",
		"action",
		"method",
		"path",
		"query",
		"status_code",
		"success",
		"message",
		"request_summary",
		"ip",
		"request_id",
		"duration_ms",
	})
	for _, log := range logs {
		_ = writer.Write([]string{
			time.Unix(log.CreatedAt, 0).Format("2006-01-02 15:04:05"),
			log.OperatorUsername,
			strconv.Itoa(log.OperatorRole),
			log.Action,
			log.Method,
			log.Path,
			log.Query,
			strconv.Itoa(log.StatusCode),
			strconv.FormatBool(log.Success),
			log.Message,
			log.RequestSummary,
			log.Ip,
			log.RequestId,
			strconv.FormatInt(log.DurationMs, 10),
		})
	}
	writer.Flush()
	if err = writer.Error(); err != nil {
		common.ApiError(c, err)
		return
	}

	fileName := fmt.Sprintf("operation-logs-%s.csv", time.Now().Format("20060102-150405"))
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", fileName))
	c.String(200, buffer.String())
}
