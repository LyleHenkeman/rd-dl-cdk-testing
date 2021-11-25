"use strict";
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("@aws-cdk/assert");
const cdk = require("@aws-cdk/core");
const BlogGlueWorkFlow = require("../lib/blog-glue-workflow-stack");
test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new BlogGlueWorkFlow.BlogGlueWorkFlowStack(app, 'MyTestStack', {});
    // THEN
    assert_1.expect(stack).to(assert_1.matchTemplate({
        "Resources": {}
    }, assert_1.MatchStyle.EXACT));
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmxvZy1nbHVlLXdvcmtmbG93LnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJibG9nLWdsdWUtd29ya2Zsb3cudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEscUVBQXFFO0FBQ3JFLGlDQUFpQzs7QUFFakMsNENBQWlGO0FBQ2pGLHFDQUFxQztBQUNyQyxvRUFBb0U7QUFHcEUsSUFBSSxDQUFDLGFBQWEsRUFBRSxHQUFHLEVBQUU7SUFDckIsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDMUIsT0FBTztJQUNQLE1BQU0sS0FBSyxHQUFHLElBQUksZ0JBQWdCLENBQUMscUJBQXFCLENBQUMsR0FBRyxFQUFFLGFBQWEsRUFBQyxFQUFFLENBQUMsQ0FBQztJQUNoRixPQUFPO0lBQ1AsZUFBUyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxzQkFBYSxDQUFDO1FBQ2hDLFdBQVcsRUFBRSxFQUFFO0tBQ2hCLEVBQUUsbUJBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFBO0FBQ3pCLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IEFtYXpvbi5jb20sIEluYy4gb3IgaXRzIGFmZmlsaWF0ZXMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4vLyBTUERYLUxpY2Vuc2UtSWRlbnRpZmllcjogTUlULTBcblxuaW1wb3J0IHsgZXhwZWN0IGFzIGV4cGVjdENESywgbWF0Y2hUZW1wbGF0ZSwgTWF0Y2hTdHlsZSB9IGZyb20gJ0Bhd3MtY2RrL2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnQGF3cy1jZGsvY29yZSc7XG5pbXBvcnQgKiBhcyBCbG9nR2x1ZVdvcmtGbG93IGZyb20gJy4uL2xpYi9ibG9nLWdsdWUtd29ya2Zsb3ctc3RhY2snO1xuaW1wb3J0IHsgQmxvZ0dsdWVXb3JrRmxvd1N0YWNrIH0gZnJvbSAnLi4vbGliL2Jsb2ctZ2x1ZS13b3JrZmxvdy1zdGFjayc7XG5cbnRlc3QoJ0VtcHR5IFN0YWNrJywgKCkgPT4ge1xuICAgIGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XG4gICAgLy8gV0hFTlxuICAgIGNvbnN0IHN0YWNrID0gbmV3IEJsb2dHbHVlV29ya0Zsb3cuQmxvZ0dsdWVXb3JrRmxvd1N0YWNrKGFwcCwgJ015VGVzdFN0YWNrJyx7fSk7XG4gICAgLy8gVEhFTlxuICAgIGV4cGVjdENESyhzdGFjaykudG8obWF0Y2hUZW1wbGF0ZSh7XG4gICAgICBcIlJlc291cmNlc1wiOiB7fVxuICAgIH0sIE1hdGNoU3R5bGUuRVhBQ1QpKVxufSk7XG4iXX0=