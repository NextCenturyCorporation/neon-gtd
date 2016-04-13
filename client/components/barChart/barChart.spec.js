'use strict';
/*
 * Copyright 2016 Next Century Corporation
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

describe('Chart: barChart', function() {
    // load the necessary modules
    beforeEach(module('neonDemo'));

    var barChartContainer;

    beforeEach(function() {
        barChartContainer = angular.element('<div><div class="barchart"></div></div>');
    });

    it('draw() initializes HTML properly', function() {
        var opts = {
            data: [],
            x: "x_column",
            y: "y_column",
            responsive: false,
            selectedKey: undefined
        };
        var chart = new charts.BarChart(barChartContainer[0], '.barchart', opts);
        chart.draw();
        // Verify that there are now two axis elements in the barchart
        expect(barChartContainer.find(".axis").length).toBe(2);
    });

    it('bars are labeled', function() {
        var opts = {
            data: [
                {
                    x_column: "foo",
                    y_column: 53
                },
                {
                    x_column: "bar",
                    y_column: 7
                }
            ],
            x: "x_column",
            y: "y_column",
            responsive: false,
            selectedKey: undefined
        };
        var chart = new charts.BarChart(barChartContainer[0], '.barchart', opts);
        chart.draw();
        expect(barChartContainer.text()).toContain("foo");
        expect(barChartContainer.text()).toContain("bar");
    });

    it('bar labels with HTML characters are escaped', function() {
        var opts = {
            data: [
                {
                    x_column: "<foo>",
                    y_column: 53
                },
                {
                    x_column: "b&ar\"",
                    y_column: 7
                }
            ],
            x: "x_column",
            y: "y_column",
            responsive: false,
            selectedKey: undefined
        };
        var chart = new charts.BarChart(barChartContainer[0], '.barchart', opts);
        chart.draw();
        // Check the html instead of the text to make sure we see the escaped characters
        expect(barChartContainer.html()).toContain("&lt;foo&gt;");
        expect(barChartContainer.html()).toContain("b&amp;ar\"");
    });

    it('tooltips with HTML characters are escaped', function() {
        // The tooltip function doesn't rely on any internal state, so just call it directly
        var tooltipBody = charts.BarChart.prototype.createTooltipBody_("<first>", "&second", 10, 12);
        // Check the html instead of the text to make sure we see the escaped characters
        expect(tooltipBody).toContain("&lt;first&gt;");
        expect(tooltipBody).toContain("&amp;second");
    });
});
