package model

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

type OperationLog struct {
	Id               int    `json:"id" gorm:"primaryKey"`
	CreatedAt        int64  `json:"created_at" gorm:"bigint;index"`
	OperatorId       int    `json:"operator_id" gorm:"index"`
	OperatorUsername string `json:"operator_username" gorm:"type:varchar(64);index"`
	OperatorRole     int    `json:"operator_role" gorm:"index"`
	Action           string `json:"action" gorm:"type:varchar(255);index"`
	Method           string `json:"method" gorm:"type:varchar(16);index"`
	Path             string `json:"path" gorm:"type:varchar(255);index"`
	Query            string `json:"query" gorm:"type:text"`
	RequestSummary   string `json:"request_summary" gorm:"type:text"`
	StatusCode       int    `json:"status_code" gorm:"index"`
	Success          bool   `json:"success" gorm:"index"`
	Message          string `json:"message" gorm:"type:text"`
	Ip               string `json:"ip" gorm:"type:varchar(64);default:''"`
	UserAgent        string `json:"user_agent" gorm:"type:varchar(255);default:''"`
	RequestId        string `json:"request_id" gorm:"type:varchar(64);index"`
	DurationMs       int64  `json:"duration_ms" gorm:"bigint;default:0"`
}

func (log *OperationLog) BeforeCreate(tx *gorm.DB) error {
	if log.CreatedAt == 0 {
		log.CreatedAt = common.GetTimestamp()
	}
	return nil
}

func truncateOperationLogString(value string, maxLen int) string {
	value = strings.TrimSpace(value)
	if maxLen <= 0 || len(value) <= maxLen {
		return value
	}
	return value[:maxLen]
}

func RecordOperationLog(log *OperationLog) {
	if log == nil {
		return
	}
	log.Path = truncateOperationLogString(log.Path, 255)
	log.Action = truncateOperationLogString(log.Action, 255)
	log.Method = truncateOperationLogString(log.Method, 16)
	log.OperatorUsername = truncateOperationLogString(log.OperatorUsername, 64)
	log.Ip = truncateOperationLogString(log.Ip, 64)
	log.UserAgent = truncateOperationLogString(log.UserAgent, 255)
	log.RequestId = truncateOperationLogString(log.RequestId, 64)
	if err := LOG_DB.Create(log).Error; err != nil {
		common.SysLog("failed to record operation log: " + err.Error())
	}
}

func buildOperationLogsQuery(operator string, method string, action string, path string, startTimestamp int64, endTimestamp int64, success *bool, statusCode int) *gorm.DB {
	tx := LOG_DB.Model(&OperationLog{})

	if operator != "" {
		tx = tx.Where("operator_username = ?", operator)
	}
	if method != "" {
		tx = tx.Where("method = ?", strings.ToUpper(method))
	}
	if action != "" {
		tx = tx.Where("action LIKE ?", "%"+action+"%")
	}
	if path != "" {
		tx = tx.Where("path LIKE ?", "%"+path+"%")
	}
	if startTimestamp != 0 {
		tx = tx.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("created_at <= ?", endTimestamp)
	}
	if success != nil {
		tx = tx.Where("success = ?", *success)
	}
	if statusCode != 0 {
		tx = tx.Where("status_code = ?", statusCode)
	}
	return tx
}

func GetOperationLogs(operator string, method string, action string, path string, startTimestamp int64, endTimestamp int64, success *bool, statusCode int, startIdx int, num int) (logs []*OperationLog, total int64, err error) {
	tx := buildOperationLogsQuery(operator, method, action, path, startTimestamp, endTimestamp, success, statusCode)

	if err = tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err = tx.Order("id desc").Limit(num).Offset(startIdx).Find(&logs).Error
	return logs, total, err
}

func GetOperationLogsForExport(operator string, method string, action string, path string, startTimestamp int64, endTimestamp int64, success *bool, statusCode int, limit int) (logs []*OperationLog, err error) {
	if limit <= 0 {
		limit = 10000
	}
	tx := buildOperationLogsQuery(operator, method, action, path, startTimestamp, endTimestamp, success, statusCode)
	err = tx.Order("id desc").Limit(limit).Find(&logs).Error
	return logs, err
}
