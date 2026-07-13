import React, { useState, useRef } from "react";
import {
  Card,
  Upload,
  Button,
  Table,
  Tag,
  Progress,
  Space,
  Typography,
  App as AntApp
} from "antd";
import { InboxOutlined, DownloadOutlined } from "@ant-design/icons";
import { uploadBulkCsv, subscribeToJob, bulkDownloadUrl } from "../api.js";

const { Dragger } = Upload;
const { Text, Paragraph } = Typography;

const STATUS_COLORS = {
  done: "green",
  error: "red",
  pending: "default"
};

export default function BulkUploader() {
  const { message } = AntApp.useApp();
  const [uploading, setUploading] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [total, setTotal] = useState(0);
  const [results, setResults] = useState([]);
  const [finished, setFinished] = useState(false);
  const unsubscribeRef = useRef(null);

  const resetState = () => {
    if (unsubscribeRef.current) unsubscribeRef.current();
    setJobId(null);
    setTotal(0);
    setResults([]);
    setFinished(false);
  };

  const handleUpload = async (file) => {
    resetState();
    setUploading(true);
    try {
      const data = await uploadBulkCsv(file);
      setJobId(data.jobId);
      setTotal(data.total);
      message.success(`Started crawling ${data.total} website(s)`);

      unsubscribeRef.current = subscribeToJob(data.jobId, {
        onResult: (r) => setResults((prev) => [...prev, r]),
        onDone: () => setFinished(true)
      });
    } catch (err) {
      message.error(err.response?.data?.error || err.message);
    } finally {
      setUploading(false);
    }
    return false; // prevent antd's default upload behavior
  };

  const totalEmails = results.reduce((sum, r) => sum + (r.emails?.length || 0), 0);

  const columns = [
    {
      title: "Website",
      dataIndex: "url",
      key: "url",
      render: (url) => <Text copyable>{url}</Text>
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 110,
      render: (status) => <Tag color={STATUS_COLORS[status] || "default"}>{status}</Tag>
    },
    {
      title: "Pages Scanned",
      dataIndex: "pagesVisited",
      key: "pagesVisited",
      width: 130
    },
    {
      title: "Saved to Supabase",
      dataIndex: "savedToDb",
      key: "savedToDb",
      width: 130,
      render: (val, record) =>
        record.dbError ? (
          <Tag color="red">failed</Tag>
        ) : (
          <Tag color="cyan">{val ?? 0} new</Tag>
        )
    },
    {
      title: "Emails Found",
      key: "emails",
      render: (_, record) =>
        record.emails?.length ? (
          <Space direction="vertical" size={2}>
            {record.emails.map((e) => (
              <Text key={e} copyable style={{ fontSize: 13 }}>
                {e}
              </Text>
            ))}
          </Space>
        ) : (
          <Text type="secondary">—</Text>
        )
    }
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card>
        <Dragger
          accept=".csv"
          multiple={false}
          showUploadList={false}
          beforeUpload={handleUpload}
          disabled={uploading || (jobId && !finished)}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p>Click or drag a CSV file to this area</p>
          <Paragraph type="secondary">
            One website URL per row (with or without a header row).
          </Paragraph>
        </Dragger>
      </Card>

      {jobId && (
        <Card
          title={
            <Space>
              <Text strong>Crawl Progress</Text>
              <Tag color="purple">{results.length} / {total} sites</Tag>
              <Tag color="blue">{totalEmails} emails found</Tag>
              {finished && <Tag color="green">Complete</Tag>}
            </Space>
          }
          extra={
            finished && (
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                href={bulkDownloadUrl(jobId)}
              >
                Download CSV
              </Button>
            )
          }
        >
          <Progress
            percent={total ? Math.round((results.length / total) * 100) : 0}
            status={finished ? "success" : "active"}
            style={{ marginBottom: 16 }}
          />
          <Table
            columns={columns}
            dataSource={results.map((r, idx) => ({ ...r, key: idx }))}
            pagination={{ pageSize: 8 }}
            size="middle"
          />
        </Card>
      )}
    </Space>
  );
}
