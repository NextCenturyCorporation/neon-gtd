'use strict';

module.exports = function(grunt) {

    grunt.initConfig({
        jshint: {
            all: [ 'Gruntfile.js', 'app/js/**/*.js' ],
            options: {
                jshintrc: '.jshintrc'
            }
        },

        bower: {
            install: {
                options: {
                    targetDir: "app/lib",
                    layout: "byComponent",
                    cleanTargetDir: true,
                    cleanBowerDir: true,
                    install: true,
                    copy: true
                }
            },
            cleanup: {
                options: {
                    targetDir: "app/lib",
                    layout: "byComponent",
                    cleanTargetDir: true,
                    cleanBowerDir: true,
                    install: false,
                    copy: false
                }
            }
        },

        /*
         * Build a WAR (web archive) without Maven or the JVM installed.
         */
        war: {
            target: {
                options: {
                    war_dist_folder: "target",
                    war_verbose: true,
                    war_name: 'neon-gtd',
                    webxml_welcome: 'index.html',
                    webxml_display_name: 'Neon Geo Temporal Dashboard',
                    webxml_mime_mapping: [{ 
                        extension: 'woff', 
                        mime_type: 'application/font-woff' 
                    }]
                },
                files: [
                    {
                        expand: true,
                        cwd: ".",
                        src: ["app/**", "lib/**"],
                        dest: ""
                    }
                ]
            }
        },

        yuidoc: {
            compile: {
                name: 'Neon Geo Temporal Dashbaord',
                description: 'An example geo-spatial, temporal analysis dashboard that uses Neon to allow multiple visualizations to interact with one another on the same data sets.',
                version: '0.8.0',
                url: 'http://neonframework.org/',
                logo: '../app/img/Neon_60x34.png',
                options: {
                    paths: 'app/js',
                    outdir: 'docs'
                }
            }
        }
    });


    grunt.loadNpmTasks('grunt-war');
    grunt.loadNpmTasks('grunt-bower-task');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-yuidoc');

    grunt.registerTask('test', ['jshint']);
    grunt.registerTask('default', ['bower:install']);

};