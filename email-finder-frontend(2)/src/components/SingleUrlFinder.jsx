import React, { useState } from "react";
import {
  Card,
  Input,
  Button,
  Table,
  Tag,
  Space,
  Typography,
  Alert,
  Empty,
  App as AntApp
} from "antd";
import { SearchOutlined, CopyOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { crawlSingleUrl } from "../api.js";

const { Text } = Typography;

export default function SingleUrlFinder() {
  const { message } = AntApp.useApp();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleSearch = async () => {
    if (!url.trim()) {
      message.warning("Enter a website URL first");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await crawlSingleUrl(url.trim());
      setResult(data);
      if (!data.emails.length) {
        message.info("Crawl finished, but no emails were found on this site.");
      } else if (data.dbError) {
        message.warning(
          `Found ${data.emails.length} email(s), but saving to Supabase failed: ${data.dbError}`
        );
      } else {
        message.success(
          `Found ${data.emails.length} email(s) — ${data.savedToDb || 0} new one(s) saved to Supabase`
        );
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyAll = () => {
    if (!result?.emails?.length) return;
    navigator.clipboard.writeText(result.emails.join(", "));
    message.success("All emails copied to clipboard");
  };

  const columns = [
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
      render: (email) => <Text copyable>{email}</Text>
    }
  ];

  const dataSource = (result?.emails || []).map((email, idx) => ({ key: idx, email }));

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card>
        <Space.Compact style={{ width: "100%" }}>
          <Input
            size="large"
            placeholder="e.g. https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onPressEnter={handleSearch}
            disabled={loading}
          />
          <Button
            type="primary"
            size="large"
            icon={<SearchOutlined />}
            loading={loading}
            onClick={handleSearch}
          >
            Find Emails
          </Button>
        </Space.Compact>
      </Card>

      {error && <Alert type="error" showIcon message="Crawl failed" description={error} />}

      {result && (
        <Card
          title={
            <Space>
              <CheckCircleOutlined style={{ color: "#52c41a" }} />
              <Text strong>{result.url}</Text>
              <Tag color="purple">{result.pagesVisited} page(s) scanned</Tag>
              <Tag color="blue">{result.emails.length} email(s)</Tag>
            </Space>
          }
          extra={
            result.emails.length > 0 && (
              <Button icon={<CopyOutlined />} onClick={copyAll}>
                Copy all
              </Button>
            )
          }
        >
          {result.emails.length ? (
            <Table
              columns={columns}
              dataSource={dataSource}
              pagination={false}
              size="middle"
            />
          ) : (
            <Empty description="No emails found" />
          )}

          {result.errors?.length > 0 && (
            <Alert
              style={{ marginTop: 16 }}
              type="warning"
              showIcon
              message={`${result.errors.length} page(s) could not be loaded`}
              description={result.errors.map((e) => e.page).join(", ")}
            />
          )}
        </Card>
      )}
    </Space>
  );
}
