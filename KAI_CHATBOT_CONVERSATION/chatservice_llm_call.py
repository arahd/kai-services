import re
import json
from zoneinfo import ZoneInfo
from datetime import datetime,timezone
from agent_framework import Agent,Message,Content
from agent_framework.exceptions import ChatClientException

from logger import get_caller_frame,logger,time_async_func,track_time
from llm_helpers import TokenCounter,load_prompt_from_file_absoulute_path,get_content_type,add_generation_tool_call_context,compress_image
from agent_pooling import AgentPool
from agent_pool_context_helper import current_aug_source, current_aug_content
PROJECT_NAME = "KAI"
SERVICE_NAME = "KAI_CHATBOT_CONVERSATION_SERVICE"

weekday_list = ['Monday','Tuesday','Wednesday', 'Thursday', 'Friday', 'Saturday','Sunday']
# Keeping this here should model start responding with its markdown response within ``` use it then
def parse_model_response(raw_str:str):
        """
        This function is responsible for parsing the model's raw response and converting them into a json format
        """
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'KAI'
    }
        # Strip markdown code fences if Claude wraps response in them
        try:
            if raw_str.startswith("```") or raw_str.endswith("```"):
                raw_str = re.sub(r"^```(?:json)?\s*", "", raw_str)
                raw_str = re.sub(r"\s*```$", "", raw_str)
            raw_str = raw_str.strip()
            return raw_str
        except Exception as e:
            logger.info(f"JSON LOAD failed when Parsing Model Response, Exception :{e}",extra=extras)
            raw_str = raw_str.strip()
            return raw_str



DIAGRAMS_COMPREHENSIVE_SPECIFICATION = """
## Comprehensive Python `diagrams` Package Specification & Provider Node Catalog
When `implement_diagram` mode is active, use Python's `diagrams` library (`mingrammer/diagrams`) to render system architecture, cloud infrastructure, microservices flows, network topologies, data pipelines, sequence/workflow diagrams, or software design charts.

### 1. Fundamental Rules & Code Construction
- Import core diagram abstractions: `from diagrams import Diagram, Cluster, Edge`
- Always instantiate `Diagram` with `show=False` and a designated filename:
  `with Diagram("Architecture Title", filename="architecture_diagram", outformat="png", show=False, direction="LR"):`
- **Diagram Directions**: `"LR"` (Left to Right), `"TB"` (Top to Bottom), `"RL"` (Right to Left), `"BT"` (Bottom to Top).
- **Sub-groupings / Clusters**: `with Cluster("Cluster or Subsystem Name"):` (can be nested).
- **Node Connections / Edges**:
  - Direct connection: `node_a >> node_b` or `node_a << node_b` or `node_a - node_b`
  - Chained flow: `node_a >> node_b >> node_c`
  - Styled & Labeled Edges: `node_a >> Edge(label="HTTPS / REST", color="darkgreen", style="dashed") >> node_b`

### 2. Available Provider Modules & Exact Class Names Index

#### A. Azure (`diagrams.azure.*`)
- **Compute (`diagrams.azure.compute`)**: `AppServices`, `FunctionApps`, `VM`, `ContainerInstances`, `ContainerRegistries`, `KubernetesServices` (or `AKS`), `BatchAccounts`, `VMScaleSets`, `ServiceFabricClusters`, `CloudServices`, `AutomanagedVM`, `ContainerApps`
- **Database & Storage (`diagrams.azure.database`)**: `SQLDatabases`, `CosmosDb`, `CacheForRedis`, `BlobStorage`, `DataFactory`, `DataLake`, `ManagedDatabases`, `SQLServers`, `SQLDatawarehouse`, `DatabaseForPostgresqlServers`, `DatabaseForMysqlServers`, `DatabaseForMariadbServers`, `ElasticDatabasePools`
- **Networking (`diagrams.azure.network` or `diagrams.azure.networking`)**: `FrontDoors`, `LoadBalancers`, `DNSZones`, `ApplicationGateway`, `Firewall`, `VirtualNetworks`, `Subnets`, `ExpressrouteCircuits`, `PublicIpAddresses`, `RouteTables`, `TrafficManagerProfiles`, `VirtualNetworkGateways`, `NetworkSecurityGroups`, `Bastions`, `PrivateEndpoint`, `Connections`
- **Integration & Messaging (`diagrams.azure.integration`)**: `ServiceBus`, `APIManagement`, `EventGridTopics`, `EventGridDomains`, `EventGridSubscriptions`, `LogicApps`, `AppConfiguration`, `IntegrationAccounts`, `Relays`, `SoftwareAsAService`
- **Analytics (`diagrams.azure.analytics`)**: `EventHubs`, `Databricks`, `LogAnalyticsWorkspaces`, `SynapseAnalytics`, `StreamAnalyticsJobs`, `DataLakeAnalytics`, `AnalysisServices`, `DataExplorerClusters`
- **Security (`diagrams.azure.security`)**: `KeyVaults`, `SecurityCenter`, `Sentinel`, `ConditionalAccess`, `Defender`
- **DevOps & Monitoring (`diagrams.azure.devops` / `diagrams.azure.monitor`)**: `ApplicationInsights`, `AzureDevops`, `Pipelines`, `Boards`, `Repos`, `Monitor`, `Logs`, `Metrics`
- **Storage (`diagrams.azure.storage`)**: `StorageAccounts`, `BlobStorage`, `AzureFileshares`, `ArchiveStorage`, `QueuesStorage`, `TableStorage`, `DataLakeStorage`
- **Web (`diagrams.azure.web`)**: `APIManagementServices`, `AppServices`, `AppServicePlans`, `FrontDoorAndCDNProfiles`, `Signalr`, `CognitiveSearch`
- **Machine Learning (`diagrams.azure.ml`)**: `AzureOpenAI`, `CognitiveServices`, `MachineLearningServiceWorkspaces`, `BotServices`

#### B. AWS (`diagrams.aws.*`)
- **Compute (`diagrams.aws.compute`)**: `EC2`, `ECS`, `EKS`, `Lambda`, `Fargate`, `Batch`, `ElasticBeanstalk`, `Lightsail`
- **Database (`diagrams.aws.database`)**: `RDS`, `Dynamodb`, `ElastiCache`, `Redshift`, `Aurora`, `Timestream`, `Neptune`, `Documentdb`
- **Networking (`diagrams.aws.network`)**: `ELB`, `ALB`, `NLB`, `VPC`, `Route53`, `CloudFront`, `APIGateway`, `DirectConnect`, `TransitGateway`, `GlobalAccelerator`
- **Integration (`diagrams.aws.integration`)**: `SQS`, `SNS`, `EventBridge`, `StepFunctions`, `Appsync`, `MQ`
- **Storage (`diagrams.aws.storage`)**: `S3`, `EFS`, `EBS`, `StorageGateway`, `FSx`, `Snowball`
- **Security (`diagrams.aws.security`)**: `IAM`, `KMS`, `Shield`, `WAF`, `Cognito`, `SecretsManager`, `Guardduty`, `Inspector`
- **Management (`diagrams.aws.management`)**: `Cloudwatch`, `Cloudtrail`, `SystemsManager`, `Config`, `Organizations`, `AutoScaling`
- **Analytics (`diagrams.aws.analytics`)**: `Athena`, `EMR`, `Kinesis`, `QuickSight`, `Glue`

#### C. GCP (`diagrams.gcp.*`)
- **Compute (`diagrams.gcp.compute`)**: `ComputeEngine` (`GCE`), `Functions` (`GCF`), `KubernetesEngine` (`GKE`), `AppEngine`, `Run`
- **Database (`diagrams.gcp.database`)**: `SQL`, `Bigtable`, `Firestore`, `Datastore`, `Spanner`, `Memorystore`
- **Networking (`diagrams.gcp.network`)**: `LoadBalancing`, `CDN`, `DNS`, `Armor`, `NAT`, `VPC`, `ExternalIpAddresses`
- **Analytics (`diagrams.gcp.analytics`)**: `BigQuery`, `PubSub`, `Dataflow`, `Dataproc`, `Composer`, `DataStudio`
- **Storage (`diagrams.gcp.storage`)**: `Storage` (`GCS`), `Filestore`, `PersistentDisk`
- **Security (`diagrams.gcp.security`)**: `IAM`, `KeyManagementService` (`KMS`), `SecretManager`, `SecurityCommandCenter`

#### D. Kubernetes (`diagrams.k8s.*`)
- **Compute (`diagrams.k8s.compute`)**: `Pod`, `Deployment`, `StatefulSet`, `DaemonSet`, `Job`, `Cronjob`, `ReplicaSet`
- **Networking (`diagrams.k8s.network`)**: `Service` (`SVC`), `Ingress`, `Endpoint` (`Ep`), `NetworkPolicy`
- **Pod Config (`diagrams.k8s.podconfig`)**: `ConfigMap` (`CM`), `Secret`
- **Storage (`diagrams.k8s.storage`)**: `PersistentVolume` (`PV`), `PersistentVolumeClaim` (`PVC`), `StorageClass` (`SC`), `Volume`
- **Group & RBAC (`diagrams.k8s.group`, `diagrams.k8s.rbac`)**: `Namespace` (`NS`), `ServiceAccount` (`SA`), `Role`, `ClusterRole`, `RoleBinding`
- **Cluster Config & Infra (`diagrams.k8s.clusterconfig`, `diagrams.k8s.infra`)**: `HorizontalPodAutoscaler` (`HPA`), `LimitRange`, `Quota`, `ETCD`, `Master`, `Node`

#### E. On-Premise & Infrastructure (`diagrams.onprem.*`)
- **Client (`diagrams.onprem.client`)**: `User`, `Users`, `Client`
- **Network (`diagrams.onprem.network`)**: `Nginx`, `HAProxy` (`Haproxy`), `Envoy`, `Internet`, `Consul`, `Istio`, `Apache`, `Kong`, `Traefik`, `CiscoRouter`, `CiscoSwitchL3`
- **Database (`diagrams.onprem.database`)**: `PostgreSQL`, `MySQL`, `MongoDB`, `Cassandra`, `ClickHouse`, `MSSQL`, `MariaDB`, `CockroachDB`, `CouchDB`, `InfluxDB`, `Neo4J`, `Oracle`
- **In-Memory & Storage (`diagrams.onprem.inmemory`, `diagrams.onprem.storage`)**: `Redis`, `Memcached`, `Hazelcast`, `CEPH`, `Glusterfs`, `Portworx`
- **Queue & Messaging (`diagrams.onprem.queue`)**: `Kafka`, `RabbitMQ`, `ActiveMQ`, `ZeroMQ`, `Nats`, `Celery`, `EMQX`
- **Compute & Container (`diagrams.onprem.compute`, `diagrams.onprem.container`)**: `Server`, `Nomad`, `Docker`, `Containerd`, `K3S`, `LXC`
- **CI/CD & GitOps (`diagrams.onprem.ci`, `diagrams.onprem.cd`, `diagrams.onprem.gitops`)**: `Jenkins`, `GithubActions`, `GitlabCI`, `CircleCI`, `ArgoCD`, `Flux`, `Tekton`
- **Monitoring & Logging (`diagrams.onprem.monitoring`, `diagrams.onprem.logging`)**: `Grafana`, `Prometheus`, `Datadog`, `Splunk`, `Sentry`, `FluentBit`, `Loki`

#### F. Generic & Virtualization (`diagrams.generic.*`)
- `diagrams.generic.blank`: `Blank`
- `diagrams.generic.compute`: `Rack`
- `diagrams.generic.database`: `SQL`
- `diagrams.generic.device`: `Mobile`, `Tablet`
- `diagrams.generic.network`: `Firewall`, `Router`, `Subnet`, `Switch`, `VPN`
- `diagrams.generic.os`: `Android`, `Centos`, `Debian`, `IOS`, `LinuxGeneral`, `RedHat`, `Ubuntu`, `Windows`
- `diagrams.generic.place`: `Datacenter`
- `diagrams.generic.storage`: `Storage`
- `diagrams.generic.virtualization`: `Virtualbox`, `Vmware`, `Qemu`

#### G. Programming Languages & Frameworks (`diagrams.programming.*`)
- **Languages (`diagrams.programming.language`)**: `Python`, `Go`, `Java`, `JavaScript` (`Javascript`), `NodeJS` (`Nodejs`), `Csharp`, `Bash`, `Cpp`, `PHP`, `Ruby`, `Rust`, `Scala`, `TypeScript`
- **Frameworks (`diagrams.programming.framework`)**: `FastAPI`, `Flask`, `Django`, `React`, `Angular`, `Vue`, `NextJs`, `Spring`, `DotNet`, `Laravel`, `Svelte`
- **Flowchart (`diagrams.programming.flowchart`)**: `Action`, `Database`, `Decision`, `Document`, `InputOutput`, `StartEnd`

#### H. SaaS Applications (`diagrams.saas.*`)
- **Chat & Communication (`diagrams.saas.chat`, `diagrams.saas.communication`)**: `Slack`, `Discord`, `Teams`, `Twilio`
- **Identity & CRM (`diagrams.saas.identity`, `diagrams.saas.crm`)**: `Auth0`, `Okta`, `Intercom`, `Zendesk`
- **Analytics, CDN & Payment (`diagrams.saas.analytics`, `diagrams.saas.cdn`, `diagrams.saas.payment`)**: `Snowflake`, `Cloudflare`, `Akamai`, `Stripe`, `Paypal`

### 3. Exception: Flowcharts & Mermaid Requests
- If the user specifically asks for **Mermaid** syntax, a **flowchart**, **sequence diagram**, **state diagram**, or **text-based process flow**, DO NOT invoke `code_interpreter`.
- Render markdown Mermaid blocks directly in your chat response text:
  ```mermaid
  graph TD
      A[Start] --> B[Process Step]
      B --> C[End]
  ```
"""

@time_async_func('image_get_answer_gpt')
async def image_get_answer_gpt(user_query, model:str,agent_pool:AgentPool,bot_type="kumaran", augcontent=None, is_from_upload=False, conversation_data=[], token_counter:TokenCounter = None, conv_id = None,imgSrc=list(),uploaded_filenames=list(),existing_filenames=list(),imgContent=list(), stage_summary=None, direct_docs=list(), rag_filenames=list(), implement_diagram: bool = False):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
    try:

        agent = agent_pool.agent_pool.get(model,None)
        if not agent:
            agent = agent_pool.agent_pool.get("gpt-4o-mini")

        start_time = datetime.now(timezone.utc)
        logger.info(f"Entering {extras['functionname']} at {start_time}", extra=extras)
        get_gpt_answer_user_query = user_query
        
        # ----Current Date and stuff----------
        naive_dt = datetime.now()
        india_tz = ZoneInfo("Asia/Kolkata")
        localized_datetime = naive_dt.replace(tzinfo=india_tz)
        localized_dt = str(localized_datetime).split(" ")
        localized_day = int(localized_datetime.weekday())
        utc_datetime = naive_dt.replace(tzinfo=india_tz).astimezone(timezone.utc)
        utc_dt = str(utc_datetime).split(" ")
        utc_day = int(utc_datetime.weekday())
        current_date_str = f"- Localized(Asia/Kolkata) Date and Day {localized_dt[0]}-{weekday_list[localized_day]} , Time : {localized_dt[1]}\n- UTC Date and Day: {utc_dt[0]}-{weekday_list[utc_day]} , Time: {utc_dt[1]}"

        conversation_history = list()
        for item in conversation_data:
            q = item.get("question", "")
            r = add_generation_tool_call_context(item)

            if isinstance(r, dict):
                r = r.get("response", json.dumps(r, ensure_ascii=False))
            if q and str(q).strip() and r and str(r).strip():
                conversation_history.append(f"User: {q}\nAssistant: {r}")

        chat_history_content = str()
        if stage_summary:
            chat_history_content = f"""
## Conversation Summary
{stage_summary}

## Past 3 conversations
{conversation_history}
"""
        else:
            chat_history_content=f"""
## Conversation History
{conversation_history}
"""

        # Direct document text formatting & instruction rendering
        direct_docs_section = ""
        if direct_docs and len(direct_docs) > 0:
            blocks = []
            for d in direct_docs:
                fname = d.get("filename", "")
                did = d.get("doc_id", "")
                cnt = d.get("content", "")
                is_tab = str(fname).lower().endswith(('.csv', '.xlsx', '.xls'))
                doc_type = "tabular_summary_or_content" if is_tab else "full_text"
                blocks.append(f'<document filename="{fname}" doc_id="{did}" type="{doc_type}">\n{cnt}\n</document>')
            direct_docs_section = "\n\n## Direct Document Context (Full Text or Tabular Summary Injected Below)\n" + "\n\n".join(blocks)

        # Build clean deduplicated filename lists for context & routing
        all_conv_filenames = []
        for fn in list(uploaded_filenames or []) + list(existing_filenames or []):
            if fn and fn not in all_conv_filenames:
                all_conv_filenames.append(fn)

        direct_filenames = [d.get("filename", "") for d in direct_docs if d.get("filename")]
        spreadsheet_files = [f for f in all_conv_filenames if str(f).lower().endswith(('.csv', '.xlsx', '.xls'))]
        direct_text_files = [f for f in direct_filenames if not str(f).lower().endswith(('.csv', '.xlsx', '.xls'))]
        rag_text_files = [f for f in rag_filenames if not str(f).lower().endswith(('.csv', '.xlsx', '.xls'))]

        routing_instructions = []

        if spreadsheet_files:
            sp_str = ", ".join([f"`{f}`" for f in spreadsheet_files])
            routing_instructions.append(
                f"Spreadsheet / Tabular Files ({sp_str}): DO NOT call `document_search`. "
                "For ANY questions, data queries, calculations, tabular summaries, or charts regarding these files, "
                "ALWAYS call the `code_interpreter` tool to write and execute sandboxed Python scripts with pandas, "
                "based on the full content or schema summary provided above and the dataset in your workspace."
            )

        if direct_text_files:
            dt_str = ", ".join([f"`{f}`" for f in direct_text_files])
            routing_instructions.append(
                f"Direct General Text Documents ({dt_str}): Full text is provided directly above in the prompt context. "
                "Answer user questions directly using this provided content without calling vector search tools."
            )

        if rag_text_files:
            rag_str = ", ".join([f"`{f}`" for f in rag_text_files])
            routing_instructions.append(
                f"Vector Search RAG Documents ({rag_str}): Use the `document_search` tool "
                "to retrieve relevant text chunks for these large general text documents."
            )

        routing_instructions.append(
            "Excel & Spreadsheet Generation (.xlsx / .csv): When the user asks to create, format, generate, export, or download data as an Excel file (.xlsx) or CSV file:\n"
            "  1. If real-world data, current statistics, or external information is needed (e.g., UN member states, country GDP, company financials, demographics), FIRST call `search_web` to retrieve the facts.\n"
            "  2. NEXT, call `code_interpreter` to write and execute a Python script using pandas/openpyxl (`df.to_excel('filename.xlsx', index=False)` or `df.to_excel('filename.xlsx', engine='openpyxl')`) to construct and save the file.\n"
            "  3. NEVER refuse file creation, NEVER claim environment/network limitations prevent file creation, and NEVER output Python script code blocks in text asking the user to run them locally. ALWAYS execute Python code via `code_interpreter` to generate and attach the downloadable `.xlsx` document card.\n"
            "  4. ALWAYS use `openpyxl` (or `engine='openpyxl'`). NEVER specify `engine='xlsxwriter'` or import `xlsxwriter` because `xlsxwriter` is not installed."
        )

        routing_instructions.append(
            "Flowcharts & Mermaid Diagrams: When the user asks for a flowchart, sequence diagram, process flow, state diagram, or explicitly mentions Mermaid/mermaid, DO NOT call `code_interpreter`. Render the diagram directly in your response text using markdown Mermaid code blocks (e.g. ```mermaid ... ```)."
        )

        if implement_diagram:
            routing_instructions.append(
                "Architecture & System Diagram Generation: `implement_diagram` mode is ENABLED. "
                "For requests to create, draw, or visualize cloud infrastructure (Azure/AWS/GCP), "
                "Kubernetes clusters, microservices topologies, network layouts, or system architecture diagrams, "
                "ALWAYS call the `code_interpreter` tool using Python's `diagrams` package (`from diagrams import Diagram, Cluster, Edge`). "
                "Refer to the Comprehensive Diagrams Specification injected below for exact import paths and class names. "
                "EXCEPTION: If the user specifically requests Mermaid, a standard flowchart, sequence diagram, or process flow, "
                "do NOT call `code_interpreter`—output markdown ```mermaid``` code directly."
            )

        if not routing_instructions:
            routing_instructions.append("Use appropriate tools as required to process user queries.")

        routing_instruction = "\n".join([f"- {instr}" for instr in routing_instructions])

        diagram_spec_section = DIAGRAMS_COMPREHENSIVE_SPECIFICATION if implement_diagram else ""

        # Dynamic System prompt structured for LLM Prompt Caching:
        # 1. Full Document Text (direct_docs_section) appears FIRST at the very top
        # 2. Dynamic Turn Instructions & File Names appear below
        # 3. Chat History & Date/Time appear LAST
        system_prompt = f"""{direct_docs_section}
{diagram_spec_section}

## Uploaded Documents Context
The following list identifies documents uploaded in the conversation.
- **Routing Directives:**
{routing_instruction}
- **Image Handling:** For image-based files, utilize either the raw image attachment or the provided text description to fulfill the user's request.
- **Spreadsheet & Numeric Data Handling:**
1. For uploaded .csv and .xlsx files, raw data files are available in your current working directory. Use `code_interpreter` to execute sandboxed Python scripts with pandas for mathematical analysis and plotting (`pd.read_excel('filename.xlsx')`, `plt.savefig('output.png')`).
2. For creating or exporting Excel spreadsheets (.xlsx) or CSV files, write Python scripts using pandas/openpyxl (`df.to_excel('output.xlsx', index=False)` or `df.to_excel('report.xlsx', engine='openpyxl')`). NEVER use `xlsxwriter` or specify `engine='xlsxwriter'`.
3. If external/real-world data is required for the Excel spreadsheet, call `search_web` first to fetch the necessary statistics/information, then call `code_interpreter` to build and save the Excel file.
4. Ensure all columns and rows in generated tables are fully populated with complete, clean data.

DO NOT prefix file paths with `./workspace/`.

**Strict Code Output Contract:**
1. The code is executed as a standalone Python script, NOT a Jupyter Notebook. The packages and their versions installed in the code interpreter are: pandas>=2.0.0, numpy>=1.24.0, scipy>=1.10.0, matplotlib>=3.7.0, seaborn>=0.12.0, openpyxl>=3.1.0, pillow>=9.5.0, diagrams>=0.23.0. Note: `xlsxwriter` is NOT installed.
2. Because this is a script, simply writing a variable name on the final line (e.g., `result`) will yield NO output. 
3. You must EXPLICITLY output your final result so the system can capture it. 
   - For tabular results/DataFrames: Print them to stdout using markdown format so they render clearly: `print(result.to_string())`.
   - For summary text, dictionaries, or single values: Use explicit `print()` statements (e.g., `print("The total revenue is:", total_revenue)`).
   - For visualizations and diagrams: Save them to disk (e.g., `plt.savefig('output.png')` or `Diagram("Name", filename="diagram", show=False)`). The system automatically captures all generated PNG/JPG/SVG images and displays them to the user.

- **All Conversation Uploaded Files:** {all_conv_filenames}
- **Current Turn Files:** {uploaded_filenames}


{chat_history_content}

## Current Date and Time
{current_date_str}
"""
        response = None


        system_message = Message(role="system",contents=[
            Content.from_text(text=system_prompt), ], )
        user_message_contents:list[Content] = [Content.from_text(text=user_query)]
        if len(imgContent)>0:
            for image_bytes in imgContent:
                compressed_image, content_type = compress_image(image_bytes)
                user_message_contents.append(Content.from_uri(uri=f"data:{content_type};base64,{compressed_image}" , media_type=content_type))
        
        user_message = Message(role="user",contents=user_message_contents)
            

        
        response = await agent.run([system_message,user_message])

        token_counter.update_usuage(response)

        plugins_consumed_tokens = agent_pool.token_consumption_from_plugins()
        token_counter.total_input_tokens+= plugins_consumed_tokens.get("total_input_tokens_consumed",0)
        token_counter.total_output_tokens+=plugins_consumed_tokens.get("total_output_tokens_consumed",0)


        #raw_str = parse_model_response(raw_str=str(response).strip())
        
        response_returned = {"response": str(response).strip(),"augSrc":current_aug_source.get(),"augContent":"\n\n".join(current_aug_content.get())}
        end_time = datetime.now(timezone.utc)
        logger.info(f"{SERVICE_NAME}: Execution time for {extras['functionname']} = {end_time - start_time}", extra=extras)
        return response_returned
    
    except ChatClientException as ce:
        raise
    
    except Exception as e:
        logger.exception(f"{SERVICE_NAME}: Error during GPT response for query:{user_query}", extra=extras)
        raise