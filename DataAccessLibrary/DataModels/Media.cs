﻿using DataAccessLibrary.UserModels;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace DataAccessLibrary.DataModels
{
    [Table("media")]
    public partial class Media
    {
        [Key]
        public int IdMedia { get; set; }
        public int IdTimelineinfo { get; set; }
        public byte MediaType { get; set; }
        [Required]
        [Column(TypeName = "text")]
        public string SourceFile { get; set; }
        public byte Gore { get; set; }
        public byte SourceFrom { get; set; }
        [Required]
        [Column(TypeName = "tinytext")]
        public string Blurb { get; set; }
        [Column(TypeName = "varchar(255)")]
        public string SubmittedBy { get; set; }

        [ForeignKey(nameof(IdTimelineinfo))]
        [InverseProperty(nameof(Timelineinfo.Media))]
        public virtual Timelineinfo IdTimelineinfoNavigation { get; set; }
        [ForeignKey(nameof(SubmittedBy))]
        [InverseProperty(nameof(Aspnetusers.Media))]
        public virtual Aspnetusers SubmittedByNavigation { get; set; }
    }
}
