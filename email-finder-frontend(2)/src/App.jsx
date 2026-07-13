import React from "react";
import { Layout, Tabs, Typography, Space } from "antd";
import { MailOutlined } from "@ant-design/icons";
import SingleUrlFinder from "./components/SingleUrlFinder.jsx";
import BulkUploader from "./components/BulkUploader.jsx";
import StoredEmails from "./components/StoredEmails.jsx";

const { Header, Content, Footer } = Layout;
const { Title, Text } = Typography;

export default function App() {
  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header
        style={{
          display: "flex",
          alignItems: "center",
          background: "#0f0f23",
          padding: "0 32px"
        }}
      >
        <Space align="center">
          <MailOutlined style={{ fontSize: 22, color: "#fff" }} />
          <Title level={4} style={{ color: "#fff", margin: 0 }}>
            Email Finder
          </Title>
        </Space>
      </Header>

      <Content style={{ padding: "32px", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <div>
            <Title level={3} style={{ marginBottom: 4 }}>
              Find every email on a website
            </Title>
            <Text type="secondary">
              Crawls a site (homepage + contact/about/team pages) with a headless
              browser and pulls out every email address it can find — not just
              HR or careers addresses.
            </Text>
          </div>

          <Tabs
            defaultActiveKey="single"
            type="card"
            items={[
              {
                key: "single",
                label: "Single Website",
                children: <SingleUrlFinder />
              },
              {
                key: "bulk",
                label: "Bulk CSV Upload",
                children: <BulkUploader />
              },
              {
                key: "stored",
                label: "Stored Emails (Supabase)",
                children: <StoredEmails />
              }
            ]}
          />
        </Space>
      </Content>

      <Footer style={{ textAlign: "center" }}>
        <Text type="secondary">Email Finder — crawl responsibly, respect robots.txt & ToS.</Text>
      </Footer>
    </Layout>
  );
}
